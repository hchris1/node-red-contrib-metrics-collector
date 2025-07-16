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

        this.messagesIncomingTotal = new promClient.Counter({
            name: 'nodered_messages_incoming_total',
            help: 'Total number of incoming messages processed',
            labelNames: ['node_id', 'node_type', 'flow_id'],
            registers: [this.register]
        });

        this.messagesOutgoingTotal = new promClient.Counter({
            name: 'nodered_messages_outgoing_total',
            help: 'Total number of outgoing messages processed',
            labelNames: ['node_id', 'node_type', 'flow_id'],
            registers: [this.register]
        });

        this.messagesIncomingPerSecond = new promClient.Gauge({
            name: 'nodered_messages_incoming_per_second',
            help: 'Incoming messages processed per second',
            labelNames: ['node_id', 'node_type', 'flow_id'],
            registers: [this.register]
        });

        this.messagesOutgoingPerSecond = new promClient.Gauge({
            name: 'nodered_messages_outgoing_per_second',
            help: 'Outgoing messages processed per second',
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

        this.incomingMessageCounters = new Map();
        this.outgoingMessageCounters = new Map();
        this.lastIncomingMessageCounts = new Map();
        this.lastOutgoingMessageCounts = new Map();
    }

    recordIncomingMessage(nodeId, nodeType, flowId) {
        const key = `${nodeId}:${nodeType}:${flowId}`;

        if (this.options.enableDetailedLogging) {
            console.log(`💾 RecordIncomingMessage: ${key} - Current count: ${this.incomingMessageCounters.get(key) || 0}`);
        }

        this.messagesIncomingTotal.inc({ node_id: nodeId, node_type: nodeType, flow_id: flowId });
        this.incomingMessageCounters.set(key, (this.incomingMessageCounters.get(key) || 0) + 1);

        if (this.options.enableDetailedLogging) {
            console.log(`💾 After recording: ${key} - New count: ${this.incomingMessageCounters.get(key)}`);
        }
    }

    recordOutgoingMessage(nodeId, nodeType, flowId) {
        const key = `${nodeId}:${nodeType}:${flowId}`;

        if (this.options.enableDetailedLogging) {
            console.log(`💾 RecordOutgoingMessage: ${key} - Current count: ${this.outgoingMessageCounters.get(key) || 0}`);
        }

        this.messagesOutgoingTotal.inc({ node_id: nodeId, node_type: nodeType, flow_id: flowId });
        this.outgoingMessageCounters.set(key, (this.outgoingMessageCounters.get(key) || 0) + 1);

        if (this.options.enableDetailedLogging) {
            console.log(`💾 After recording: ${key} - New count: ${this.outgoingMessageCounters.get(key)}`);
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
            console.log(`🔢 Calculating messages per second for ${this.incomingMessageCounters.size} incoming and ${this.outgoingMessageCounters.size} outgoing tracked nodes`);
        }

        for (const [key, currentCount] of this.incomingMessageCounters) {
            const lastCount = this.lastIncomingMessageCounts.get(key) || 0;
            const rate = Math.max(0, currentCount - lastCount) / 5; // 5 second intervals

            if (this.options.enableDetailedLogging) {
                console.log(`🔢 ${key} (incoming): current=${currentCount}, last=${lastCount}, rate=${rate}`);
            }

            const [nodeId, nodeType, flowId] = key.split(':');
            this.messagesIncomingPerSecond.set({ node_id: nodeId, node_type: nodeType, flow_id: flowId }, rate);

            this.lastIncomingMessageCounts.set(key, currentCount);
        }

        for (const [key, currentCount] of this.outgoingMessageCounters) {
            const lastCount = this.lastOutgoingMessageCounts.get(key) || 0;
            const rate = Math.max(0, currentCount - lastCount) / 5; // 5 second intervals

            if (this.options.enableDetailedLogging) {
                console.log(`🔢 ${key} (outgoing): current=${currentCount}, last=${lastCount}, rate=${rate}`);
            }

            const [nodeId, nodeType, flowId] = key.split(':');
            this.messagesOutgoingPerSecond.set({ node_id: nodeId, node_type: nodeType, flow_id: flowId }, rate);

            this.lastOutgoingMessageCounts.set(key, currentCount);
        }
    }

    calculateRealFlowMetrics() {
        const uniqueFlows = new Set();

        for (const [key] of this.incomingMessageCounters) {
            const [nodeId, nodeType, flowId] = key.split(':');
            if (flowId && flowId !== 'undefined') {
                uniqueFlows.add(flowId);
            }
        }

        for (const [key] of this.outgoingMessageCounters) {
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

        for (const [key] of this.incomingMessageCounters) {
            const [nodeId, nodeType, flowId] = key.split(':');
            if (nodeType && nodeType !== 'undefined') {
                uniqueNodes.add(nodeId);

                nodeTypes[nodeType] = (nodeTypes[nodeType] || 0) + 1;
                activeNodeTypes[nodeType] = (activeNodeTypes[nodeType] || 0) + 1;
            }
        }

        for (const [key] of this.outgoingMessageCounters) {
            const [nodeId, nodeType, flowId] = key.split(':');
            if (nodeType && nodeType !== 'undefined') {
                uniqueNodes.add(nodeId);

                if (!this.incomingMessageCounters.has(key)) {
                    nodeTypes[nodeType] = (nodeTypes[nodeType] || 0) + 1;
                    activeNodeTypes[nodeType] = (activeNodeTypes[nodeType] || 0) + 1;
                }
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