const promClient = require('prom-client');

class MetricsCollector {
    constructor(options = {}) {
        this.options = {
            enableDetailedLogging: false,
            maxTimingEntries: 1000,
            collectInterval: 5000,
            ...options
        };

        this.register = new promClient.Registry();

        promClient.collectDefaultMetrics({ register: this.register });

        this.initializeMetrics();

        this.collectInterval = null;
        this.isCollecting = false;
    }

    initializeMetrics() {
        this.flowsTotal = new promClient.Gauge({
            name: 'nodered_flows_total',
            help: 'Total number of flows',
            registers: [this.register]
        });

        this.flowsActive = new promClient.Gauge({
            name: 'nodered_flows_active',
            help: 'Number of active flows',
            registers: [this.register]
        });

        this.nodesTotal = new promClient.Gauge({
            name: 'nodered_nodes_total',
            help: 'Total number of nodes',
            labelNames: ['type'],
            registers: [this.register]
        });

        this.nodesActive = new promClient.Gauge({
            name: 'nodered_nodes_active',
            help: 'Number of active nodes',
            labelNames: ['type'],
            registers: [this.register]
        });

        this.messagesTotal = new promClient.Counter({
            name: 'nodered_messages_total',
            help: 'Total number of messages processed',
            labelNames: ['node_id', 'node_type', 'flow_id'],
            registers: [this.register]
        });

        this.messagesPerSecond = new promClient.Gauge({
            name: 'nodered_messages_per_second',
            help: 'Messages processed per second',
            labelNames: ['node_id', 'node_type', 'flow_id'],
            registers: [this.register]
        });

        this.errorsTotal = new promClient.Counter({
            name: 'nodered_errors_total',
            help: 'Total number of errors',
            labelNames: ['node_id', 'node_type', 'flow_id', 'error_type'],
            registers: [this.register]
        });

        this.nodeExecutionTime = new promClient.Histogram({
            name: 'nodered_node_execution_time_seconds',
            help: 'Node execution time in seconds',
            labelNames: ['node_id', 'node_type', 'flow_id'],
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
            registers: [this.register]
        });

        this.memoryUsage = new promClient.Gauge({
            name: 'nodered_memory_usage_bytes',
            help: 'Memory usage in bytes',
            labelNames: ['type'],
            registers: [this.register]
        });

        this.runtimeInfo = new promClient.Gauge({
            name: 'nodered_runtime_info',
            help: 'Runtime information',
            labelNames: ['version', 'platform'],
            registers: [this.register]
        });

        this.messageCounters = new Map();
        this.lastMessageCounts = new Map();
    }

    recordMessage(nodeId, nodeType, flowId) {
        const key = `${nodeId}:${nodeType}:${flowId}`;

        if (this.options.enableDetailedLogging) {
            console.log(`💾 RecordMessage: ${key} - Current count: ${this.messageCounters.get(key) || 0}`);
        }

        this.messagesTotal.inc({ node_id: nodeId, node_type: nodeType, flow_id: flowId });
        this.messageCounters.set(key, (this.messageCounters.get(key) || 0) + 1);

        if (this.options.enableDetailedLogging) {
            console.log(`💾 After recording: ${key} - New count: ${this.messageCounters.get(key)}`);
        }
    }

    recordError(nodeId, nodeType, flowId, errorType) {
        this.errorsTotal.inc({
            node_id: nodeId,
            node_type: nodeType,
            flow_id: flowId,
            error_type: errorType
        });
    }

    recordNodeExecution(nodeId, nodeType, flowId, duration) {
        this.nodeExecutionTime.observe({
            node_id: nodeId,
            node_type: nodeType,
            flow_id: flowId
        }, duration);
    }

    updateMemoryUsage(type, bytes) {
        this.memoryUsage.set({ type }, bytes);
    }

    updateRuntimeInfo(version, platform) {
        this.runtimeInfo.set({ version, platform }, 1);
    }

    calculateMessagesPerSecond() {
        const now = Date.now();

        if (this.options.enableDetailedLogging) {
            console.log(`🔢 Calculating messages per second for ${this.messageCounters.size} tracked nodes`);
        }

        for (const [key, currentCount] of this.messageCounters) {
            const lastCount = this.lastMessageCounts.get(key) || 0;
            const rate = Math.max(0, currentCount - lastCount) / 5; // 5 second intervals

            if (this.options.enableDetailedLogging) {
                console.log(`🔢 ${key}: current=${currentCount}, last=${lastCount}, rate=${rate}`);
            }

            const [nodeId, nodeType, flowId] = key.split(':');
            this.messagesPerSecond.set({ node_id: nodeId, node_type: nodeType, flow_id: flowId }, rate);

            this.lastMessageCounts.set(key, currentCount);
        }
    }

    calculateRealFlowMetrics() {
        const uniqueFlows = new Set();

        for (const [key] of this.messageCounters) {
            const [nodeId, nodeType, flowId] = key.split(':');
            if (flowId && flowId !== 'undefined') {
                uniqueFlows.add(flowId);
            }
        }

        const totalFlows = uniqueFlows.size;
        const activeFlows = totalFlows;

        return {
            totalFlows,
            activeFlows,
            flowIds: Array.from(uniqueFlows)
        };
    }

    calculateRealNodeMetrics() {
        const nodeTypes = {};
        const activeNodeTypes = {};
        const uniqueNodes = new Set();

        for (const [key] of this.messageCounters) {
            const [nodeId, nodeType, flowId] = key.split(':');
            if (nodeType && nodeType !== 'undefined') {
                uniqueNodes.add(nodeId);

                nodeTypes[nodeType] = (nodeTypes[nodeType] || 0) + 1;
                activeNodeTypes[nodeType] = (activeNodeTypes[nodeType] || 0) + 1;
            }
        }

        return {
            nodeTypes,
            activeNodeTypes,
            totalNodes: uniqueNodes.size
        };
    }

    updateMetricsFromRealData() {
        const flowMetrics = this.calculateRealFlowMetrics();
        if (flowMetrics.totalFlows > 0) {
            this.flowsTotal.set(flowMetrics.totalFlows);
            this.flowsActive.set(flowMetrics.activeFlows);
        }

        const nodeMetrics = this.calculateRealNodeMetrics();
        if (nodeMetrics.totalNodes > 0) {
            Object.keys(nodeMetrics.nodeTypes).forEach(type => {
                this.nodesTotal.set({ type }, nodeMetrics.nodeTypes[type]);
                this.nodesActive.set({ type }, nodeMetrics.activeNodeTypes[type]);
            });
        }

        return {
            flows: flowMetrics,
            nodes: nodeMetrics
        };
    }

    start() {
        if (this.isCollecting) return;

        this.isCollecting = true;
        this.collectInterval = setInterval(() => {
            this.calculateMessagesPerSecond();
            this.updateSystemMetrics();
        }, 5000);

        console.log('Metrics collection started');
    }

    stop() {
        if (!this.isCollecting) return;

        this.isCollecting = false;
        if (this.collectInterval) {
            clearInterval(this.collectInterval);
            this.collectInterval = null;
        }

        console.log('Metrics collection stopped');
    }

    updateSystemMetrics() {
        const usage = process.memoryUsage();
        this.updateMemoryUsage('rss', usage.rss);
        this.updateMemoryUsage('heapTotal', usage.heapTotal);
        this.updateMemoryUsage('heapUsed', usage.heapUsed);
        this.updateMemoryUsage('external', usage.external);
    }

    getMetrics() {
        return this.register.metrics();
    }

    getRegistry() {
        return this.register;
    }
}

module.exports = MetricsCollector; 