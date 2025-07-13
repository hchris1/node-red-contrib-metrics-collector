/**
 * Metrics Collector
 * Collects and stores metrics about Node-RED flows and nodes
 */

const promClient = require('prom-client');

class MetricsCollector {
    constructor(options = {}) {
        this.options = {
            enableDetailedLogging: false,
            maxTimingEntries: 1000,
            collectInterval: 5000,
            ...options
        };
        
        // Create a registry for our metrics
        this.register = new promClient.Registry();
        
        // Add default metrics (process, nodejs)
        promClient.collectDefaultMetrics({ register: this.register });
        
        // Initialize custom metrics
        this.initializeMetrics();
        
        this.collectInterval = null;
        this.isCollecting = false;
    }

    initializeMetrics() {
        // Flow metrics
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

        // Node metrics
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

        // Message metrics
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

        // Error metrics
        this.errorsTotal = new promClient.Counter({
            name: 'nodered_errors_total',
            help: 'Total number of errors',
            labelNames: ['node_id', 'node_type', 'flow_id', 'error_type'],
            registers: [this.register]
        });

        // Performance metrics
        this.nodeExecutionTime = new promClient.Histogram({
            name: 'nodered_node_execution_time_seconds',
            help: 'Node execution time in seconds',
            labelNames: ['node_id', 'node_type', 'flow_id'],
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
            registers: [this.register]
        });

        // Memory metrics
        this.memoryUsage = new promClient.Gauge({
            name: 'nodered_memory_usage_bytes',
            help: 'Memory usage in bytes',
            labelNames: ['type'],
            registers: [this.register]
        });

        // Runtime info
        this.runtimeInfo = new promClient.Gauge({
            name: 'nodered_runtime_info',
            help: 'Runtime information',
            labelNames: ['version', 'platform'],
            registers: [this.register]
        });

        // Initialize collections for message tracking
        this.messageCounters = new Map();
        this.lastMessageCounts = new Map();
    }

    // Message tracking methods
    recordMessage(nodeId, nodeType, flowId) {
        this.messagesTotal.inc({ node_id: nodeId, node_type: nodeType, flow_id: flowId });
        
        const key = `${nodeId}:${nodeType}:${flowId}`;
        this.messageCounters.set(key, (this.messageCounters.get(key) || 0) + 1);
    }

    // Error tracking methods
    recordError(nodeId, nodeType, flowId, errorType) {
        this.errorsTotal.inc({ 
            node_id: nodeId, 
            node_type: nodeType, 
            flow_id: flowId,
            error_type: errorType 
        });
    }

    // Performance tracking methods
    recordNodeExecution(nodeId, nodeType, flowId, duration) {
        this.nodeExecutionTime.observe({ 
            node_id: nodeId, 
            node_type: nodeType, 
            flow_id: flowId 
        }, duration);
    }

    // Memory tracking methods
    updateMemoryUsage(type, bytes) {
        this.memoryUsage.set({ type }, bytes);
    }

    // Runtime info methods
    updateRuntimeInfo(version, platform) {
        this.runtimeInfo.set({ version, platform }, 1);
    }

    // Calculate messages per second
    calculateMessagesPerSecond() {
        const now = Date.now();
        
        for (const [key, currentCount] of this.messageCounters) {
            const lastCount = this.lastMessageCounts.get(key) || 0;
            const rate = Math.max(0, currentCount - lastCount) / 5; // 5 second intervals
            
            // Parse the key to get labels
            const [nodeId, nodeType, flowId] = key.split(':');
            this.messagesPerSecond.set({ node_id: nodeId, node_type: nodeType, flow_id: flowId }, rate);
            
            this.lastMessageCounts.set(key, currentCount);
        }
    }

    /**
     * Calculate flow metrics from actual data
     * @returns {Object} { totalFlows, activeFlows, flowIds }
     */
    calculateRealFlowMetrics() {
        const uniqueFlows = new Set();
        
        // Extract unique flow IDs from the actual message data
        for (const [key] of this.messageCounters) {
            const [nodeId, nodeType, flowId] = key.split(':');
            if (flowId && flowId !== 'undefined') {
                uniqueFlows.add(flowId);
            }
        }
        
        const totalFlows = uniqueFlows.size;
        const activeFlows = totalFlows; // All flows with messages are considered active
        
        return {
            totalFlows,
            activeFlows,
            flowIds: Array.from(uniqueFlows)
        };
    }

    /**
     * Calculate node type metrics from actual data
     * @returns {Object} { nodeTypes, activeNodeTypes, totalNodes }
     */
    calculateRealNodeMetrics() {
        const nodeTypes = {};
        const activeNodeTypes = {};
        const uniqueNodes = new Set();
        
        // Extract node types and counts from actual message data
        for (const [key] of this.messageCounters) {
            const [nodeId, nodeType, flowId] = key.split(':');
            if (nodeType && nodeType !== 'undefined') {
                // Count unique nodes
                uniqueNodes.add(nodeId);
                
                // Count by node type
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

    /**
     * Update flow and node metrics from real data
     */
    updateMetricsFromRealData() {
        // Calculate and update flow metrics
        const flowMetrics = this.calculateRealFlowMetrics();
        if (flowMetrics.totalFlows > 0) {
            this.flowsTotal.set(flowMetrics.totalFlows);
            this.flowsActive.set(flowMetrics.activeFlows);
        }
        
        // Calculate and update node metrics
        const nodeMetrics = this.calculateRealNodeMetrics();
        if (nodeMetrics.totalNodes > 0) {
            // Update node type counts
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

    // Start collecting metrics
    start() {
        if (this.isCollecting) return;
        
        this.isCollecting = true;
        this.collectInterval = setInterval(() => {
            this.calculateMessagesPerSecond();
            this.updateSystemMetrics();
        }, 5000);
        
        console.log('Metrics collection started');
    }

    // Stop collecting metrics
    stop() {
        if (!this.isCollecting) return;
        
        this.isCollecting = false;
        if (this.collectInterval) {
            clearInterval(this.collectInterval);
            this.collectInterval = null;
        }
        
        console.log('Metrics collection stopped');
    }

    // Update system metrics
    updateSystemMetrics() {
        const usage = process.memoryUsage();
        this.updateMemoryUsage('rss', usage.rss);
        this.updateMemoryUsage('heapTotal', usage.heapTotal);
        this.updateMemoryUsage('heapUsed', usage.heapUsed);
        this.updateMemoryUsage('external', usage.external);
    }

    // Get metrics in Prometheus format
    getMetrics() {
        return this.register.metrics();
    }

    // Get metrics registry
    getRegistry() {
        return this.register;
    }
}

module.exports = MetricsCollector; 