class NodeRedHooks {
    constructor(metricsCollector, options = {}) {
        this.metricsCollector = metricsCollector;
        this.options = {
            enableDetailedLogging: false,
            maxTimingEntries: 1000,
            batchSize: 100,
            flushInterval: 1000,
            collectInterval: 5000,
            ...options
        };

        this.RED = null;
        this.isInitialized = false;
        this.updateInterval = null;
        this.messageCount = 0;
        this.nodeExecutionTimes = new Map();
        this.messageStartTimes = new Map();
        this.registeredHooks = [];

        this.messageBatch = [];
        this.batchTimer = null;

        this.cleanupTimer = null;
        this.startCleanupTimer();
    }

    init(RED) {
        if (this.isInitialized) return;

        this.RED = RED;
        this.isInitialized = true;

        if (this.options.enableDetailedLogging) {
            console.log('🔧 Setting up Node-RED hooks using official Hook API...');
        }

        try {
            this.setupOfficialHooks();
            this.setupEventBasedHooks();
            this.hookIntoActiveNodes();

            this.startPeriodicUpdates();

            if (this.options.enableDetailedLogging) {
                console.log('✅ Node-RED hooks initialized successfully');
            }

        } catch (error) {
            console.error('❌ Error initializing Node-RED hooks:', error.message);
            this.setupEventBasedHooks();
        }
    }

    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanupTimingEntries();
        }, 30000);
    }

    cleanupTimingEntries() {
        const now = Date.now();
        const maxAge = 60000;

        if (this.messageStartTimes.size > this.options.maxTimingEntries) {
            const entries = Array.from(this.messageStartTimes.entries());

            entries.sort((a, b) => a[1] - b[1]);
            const toRemove = entries.slice(0, entries.length - this.options.maxTimingEntries);

            toRemove.forEach(([key]) => {
                this.messageStartTimes.delete(key);
            });

            if (this.options.enableDetailedLogging) {
                console.log(`🧹 Cleaned up ${toRemove.length} old timing entries`);
            }
        }

        let removedCount = 0;
        for (const [key, startTime] of this.messageStartTimes.entries()) {
            if (now - startTime > maxAge) {
                this.messageStartTimes.delete(key);
                removedCount++;
            }
        }

        if (removedCount > 0 && this.options.enableDetailedLogging) {
            console.log(`🧹 Cleaned up ${removedCount} expired timing entries`);
        }
    }

    processBatch() {
        if (this.messageBatch.length === 0) return;

        const batch = this.messageBatch.splice(0, this.options.batchSize);

        batch.forEach(({ nodeId, nodeType, flowId, type }) => {
            if (this.options.enableDetailedLogging) {
                console.log(`📊 Recording message for node ${nodeType} (${nodeId}) in flow ${flowId} - type: ${type}`);
            }
            
            if (type === 'send') {
                this.metricsCollector.recordOutgoingMessage(nodeId, nodeType, flowId);
            } else if (type === 'receive') {
                this.metricsCollector.recordIncomingMessage(nodeId, nodeType, flowId);
            }
        });

        if (this.messageBatch.length > 0) {
            this.batchTimer = setTimeout(() => this.processBatch(), this.options.flushInterval);
        } else {
            this.batchTimer = null;
        }
    }

    addToBatch(nodeId, nodeType, flowId, type) {
        this.messageBatch.push({ nodeId, nodeType, flowId, type });

        if (this.messageBatch.length >= this.options.batchSize) {
            this.processBatch();
        } else if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => this.processBatch(), this.options.flushInterval);
        }
    }

    setupOfficialHooks() {
        console.log('🔧 Setting up official Node-RED hooks...');

        if (this.RED.hooks) {
            const onSendHook = this.RED.hooks.add('onSend', (sendEvents) => {
                sendEvents.forEach((sendEvent) => {
                    this.handleSendEvent(sendEvent);
                });
            });
            this.registeredHooks.push({ type: 'onSend', hook: onSendHook });
            console.log('✅ onSend hook registered');
        }

        if (this.RED.hooks) {
            const onReceiveHook = this.RED.hooks.add('onReceive', (receiveEvent) => {
                this.handleReceiveEvent(receiveEvent);
            });
            this.registeredHooks.push({ type: 'onReceive', hook: onReceiveHook });
            console.log('✅ onReceive hook registered');
        }

        if (this.RED.hooks) {
            const onCompleteHook = this.RED.hooks.add('onComplete', (completeEvent) => {
                this.handleCompleteEvent(completeEvent);
            });
            this.registeredHooks.push({ type: 'onComplete', hook: onCompleteHook });
            console.log('✅ onComplete hook registered');
        }

        console.log(`✅ Successfully registered ${this.registeredHooks.length} official hooks`);
    }

    handleSendEvent(sendEvent) {
        try {
            const node = sendEvent.source?.node || sendEvent.source;
            const nodeId = node?.id || sendEvent.source?.id || 'unknown';
            const nodeType = node?.type || sendEvent.source?.type || 'unknown';
            const flowId = node?.z || sendEvent.source?.z || 'unknown';
            const messageId = sendEvent.msg?._msgid || this.generateMessageId();

            if (this.options.enableDetailedLogging) {
                console.log(`📤 Send Event - Node: ${nodeType} (${nodeId}) in flow ${flowId}, msgId: ${messageId}`);
                console.log(`📤 Send Event structure:`, JSON.stringify({
                    nodeId, nodeType, flowId,
                    sourceNode: !!sendEvent.source?.node,
                    sourceId: sendEvent.source?.id,
                    sourceType: sendEvent.source?.type
                }, null, 2));
            }

            try {
                // Track all send events regardless of node type
                this.addToBatch(nodeId, nodeType, flowId, 'send');

                const timingKey = `${nodeId}_${messageId}`;
                this.messageStartTimes.set(timingKey, Date.now());

            } catch (error) {
                this.metricsCollector.recordError(nodeId, nodeType, flowId, 'send_processing');
                if (this.options.enableDetailedLogging) {
                    console.log(`❌ Error processing send event for ${nodeType} (${nodeId}): ${error.message}`);
                }
            }

        } catch (error) {
            console.log('❌ Error handling send event:', error.message);
        }
    }

    handleReceiveEvent(receiveEvent) {
        try {
            const node = receiveEvent.destination?.node || receiveEvent.destination;
            const nodeId = node?.id || receiveEvent.destination?.id || 'unknown';
            const nodeType = node?.type || receiveEvent.destination?.type || 'unknown';
            const flowId = node?.z || receiveEvent.destination?.z || 'unknown';

            if (this.options.enableDetailedLogging) {
                console.log(`📥 Receive Event - Node: ${nodeType} (${nodeId}) in flow ${flowId}`);
                console.log(`📥 Receive Event structure:`, JSON.stringify({
                    nodeId, nodeType, flowId,
                    destNode: !!receiveEvent.destination?.node,
                    destId: receiveEvent.destination?.id,
                    destType: receiveEvent.destination?.type
                }, null, 2));
            }

            try {
                const messageId = receiveEvent.msg?._msgid || this.generateMessageId();
                const timingKey = `${nodeId}_${messageId}`;
                this.messageStartTimes.set(timingKey, Date.now());

                this.addToBatch(nodeId, nodeType, flowId, 'receive');

            } catch (error) {
                this.metricsCollector.recordError(nodeId, nodeType, flowId, 'receive_processing');
                if (this.options.enableDetailedLogging) {
                    console.log(`❌ Error processing receive event for ${nodeType} (${nodeId}): ${error.message}`);
                }
            }

        } catch (error) {
            console.log('❌ Error handling receive event:', error.message);
        }
    }

    handleCompleteEvent(completeEvent) {
        try {
            const node = completeEvent.node?.node || completeEvent.node;
            const nodeId = node?.id || completeEvent.node?.id || 'unknown';
            const nodeType = node?.type || completeEvent.node?.type || 'unknown';
            const flowId = node?.z || completeEvent.node?.z || 'unknown';
            const messageId = completeEvent.msg?._msgid || 'unknown';

            if (this.options.enableDetailedLogging) {
                console.log(`✅ Node ${nodeType} (${nodeId}) completed processing`);
            }

            try {
                const timingKey = `${nodeId}_${messageId}`;
                const startTime = this.messageStartTimes.get(timingKey);

                if (startTime) {
                    const executionTime = (Date.now() - startTime) / 1000;
                    if (this.options.enableDetailedLogging) {
                        console.log(`⏱️  Node ${nodeType} (${nodeId}) total processing time: ${(executionTime * 1000).toFixed(3)}ms`);
                    }

                    this.metricsCollector.recordNodeExecution(nodeId, nodeType, flowId, executionTime);

                    this.messageStartTimes.delete(timingKey);
                }

                if (completeEvent.error) {
                    const errorType = completeEvent.error.name || 'execution';
                    this.metricsCollector.recordError(nodeId, nodeType, flowId, errorType);

                    if (this.options.enableDetailedLogging) {
                        console.log(`❌ Node ${nodeType} (${nodeId}) completed with error: ${errorType}`);
                    }
                }

            } catch (error) {
                this.metricsCollector.recordError(nodeId, nodeType, flowId, 'complete_processing');
                if (this.options.enableDetailedLogging) {
                    console.log(`❌ Error processing complete event for ${nodeType} (${nodeId}): ${error.message}`);
                }
            }

        } catch (error) {
            console.log('❌ Error handling complete event:', error.message);
        }
    }

    setupEventBasedHooks() {
        console.log('🔧 Setting up event-based hooks as fallback...');

        try {
            if (this.RED.events) {
                console.log('🎯 Setting up RED.events listeners...');

                this.RED.events.on('runtime-event', (event) => {
                    console.log('🚀 Runtime event:', event);
                    if (event.id === 'flows-started') {
                        this.collectFlowMetrics();
                        this.hookIntoActiveNodes();
                    }
                });

                this.RED.events.on('flows:started', () => {
                    console.log('🔄 Flows started event');
                    setTimeout(() => {
                        this.collectFlowMetrics();
                        this.hookIntoActiveNodes();
                    }, 1000);
                });

                this.RED.events.on('flows:stopped', () => {
                    console.log('🛑 Flows stopped event');
                    this.messageStartTimes.clear();
                });

                this.RED.events.on('node-error', (event) => {
                    this.handleNodeError(event);
                });

                this.RED.events.on('flow-error', (event) => {
                    this.handleFlowError(event);
                });

                console.log('✅ Event-based hooks setup complete');
            } else {
                console.log('⚠️ No events available, monitoring will be limited');
            }
        } catch (error) {
            console.log('❌ Error setting up event-based hooks:', error.message);
        }
    }

    handleNodeError(event) {
        try {
            const nodeId = event.node?.id || 'unknown';
            const nodeType = event.node?.type || 'unknown';
            const flowId = event.node?.z || 'unknown';
            const errorType = event.error?.name || 'runtime';

            this.metricsCollector.recordError(nodeId, nodeType, flowId, errorType);

            if (this.options.enableDetailedLogging) {
                console.log(`❌ Node error recorded: ${nodeType} (${nodeId}) - ${errorType}`);
            }
        } catch (error) {
            console.log('❌ Error handling node error event:', error.message);
        }
    }

    handleFlowError(event) {
        try {
            const flowId = event.flow?.id || 'unknown';
            const errorType = event.error?.name || 'flow';

            this.metricsCollector.recordError('flow', 'flow', flowId, errorType);

            if (this.options.enableDetailedLogging) {
                console.log(`❌ Flow error recorded: ${flowId} - ${errorType}`);
            }
        } catch (error) {
            console.log('❌ Error handling flow error event:', error.message);
        }
    }

    hookIntoActiveNodes() {
        try {
            if (this.options.enableDetailedLogging) {
                console.log('🔧 Node hooking disabled - using official hooks instead');
            }

        } catch (error) {
            console.log('❌ Error in node hooking:', error.message);
        }
    }

    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    startPeriodicUpdates() {
        console.log('🔄 Starting periodic updates...');

        this.updateInterval = setInterval(() => {
            try {
                this.collectFlowMetrics();
                this.collectNodeTypeMetrics();
                this.updateSystemMetrics();

                if (this.messageCount > 0) {
                    if (this.options.enableDetailedLogging) {
                        console.log(`📊 Messages processed in last 5s: ${this.messageCount}`);
                    }
                    this.messageCount = 0;
                }
            } catch (error) {
                console.log('❌ Error in periodic update:', error.message);
            }
        }, this.options.collectInterval);
    }

    collectInitialMetrics() {
        console.log('📊 Collecting initial metrics...');

        try {
            this.collectRuntimeMetrics();
            this.collectFlowMetrics();
            this.collectNodeTypeMetrics();

            if (!this.RED.hooks || typeof this.RED.hooks.add !== 'function') {
                setTimeout(() => this.hookIntoActiveNodes(), 2000);
            }
        } catch (error) {
            console.log('❌ Error collecting initial metrics:', error.message);
        }
    }

    collectRuntimeMetrics() {
        try {
            const nodeVersion = process.version;
            const platform = process.platform;

            console.log('📊 Runtime metrics:', { nodeVersion, platform });
            this.metricsCollector.updateRuntimeInfo(nodeVersion, platform);
        } catch (error) {
            console.log('❌ Error collecting runtime metrics:', error.message);
        }
    }

    collectFlowMetrics() {
        try {
            const realMetrics = this.metricsCollector.updateMetricsFromRealData();

            if (realMetrics.flows.totalFlows > 0) {
                if (this.options.enableDetailedLogging) {
                    console.log(`📊 Flow metrics (from real data): ${realMetrics.flows.activeFlows}/${realMetrics.flows.totalFlows} active flows`);
                    console.log(`📊 Flow IDs: ${realMetrics.flows.flowIds.join(', ')}`);
                }
            } else {
                if (this.options.enableDetailedLogging) {
                    console.log('📊 No flow data available yet');
                }
            }
        } catch (error) {
            console.log('❌ Error collecting flow metrics:', error.message);
        }
    }

    collectNodeTypeMetrics() {
        try {
            const realMetrics = this.metricsCollector.updateMetricsFromRealData();

            if (realMetrics.nodes.totalNodes > 0) {
                if (this.options.enableDetailedLogging) {
                    console.log(`📊 Node metrics (from real data): ${realMetrics.nodes.totalNodes} unique nodes`);
                    console.log(`📊 Node type counts:`, realMetrics.nodes.nodeTypes);
                    console.log(`📊 Active node type counts:`, realMetrics.nodes.activeNodeTypes);
                }
            } else {
                if (this.options.enableDetailedLogging) {
                    console.log('📊 No node data available yet');
                }
            }
        } catch (error) {
            console.log('❌ Error collecting node type metrics:', error.message);
        }
    }

    updateSystemMetrics() {
        try {
            const memUsage = process.memoryUsage();

            this.metricsCollector.updateMemoryUsage('rss', memUsage.rss);
            this.metricsCollector.updateMemoryUsage('heapTotal', memUsage.heapTotal);
            this.metricsCollector.updateMemoryUsage('heapUsed', memUsage.heapUsed);
            this.metricsCollector.updateMemoryUsage('external', memUsage.external);

            console.log('📊 System metrics updated');
        } catch (error) {
            console.log('❌ Error updating system metrics:', error.message);
        }
    }

    stop() {
        if (this.options.enableDetailedLogging) {
            console.log('🛑 Stopping Node-RED hooks...');
        }

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        this.processBatch();

        this.messageStartTimes.clear();
        this.messageBatch = [];

        this.registeredHooks = [];

        this.isInitialized = false;

        if (this.options.enableDetailedLogging) {
            console.log('✅ Node-RED hooks stopped');
        }
    }
}

module.exports = NodeRedHooks; 