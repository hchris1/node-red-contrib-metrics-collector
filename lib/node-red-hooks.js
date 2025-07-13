/**
 * Node-RED Hooks
 * Integrates with Node-RED runtime to collect metrics using official Hook API
 */

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
        
        // Performance optimization: message batching
        this.messageBatch = [];
        this.batchTimer = null;
        
        // Performance optimization: timing cleanup
        this.cleanupTimer = null;
        this.startCleanupTimer();
    }

    /**
     * Initialize hooks into Node-RED runtime using official Hook API
     * @param {Object} RED - Node-RED runtime object
     */
    init(RED) {
        if (this.isInitialized) return;
        
        this.RED = RED;
        this.isInitialized = true;
        
        if (this.options.enableDetailedLogging) {
            console.log('🔧 Setting up Node-RED hooks using official Hook API...');
        }
        
        try {
            // Set up different hook types based on what's available
            this.setupOfficialHooks();
            this.setupEventBasedHooks();
            this.hookIntoActiveNodes();
            
            this.startPeriodicUpdates();
            
            if (this.options.enableDetailedLogging) {
                console.log('✅ Node-RED hooks initialized successfully');
            }
            
        } catch (error) {
            console.error('❌ Error initializing Node-RED hooks:', error.message);
            // Try fallback initialization
            this.setupEventBasedHooks();
        }
    }

    /**
     * Start cleanup timer to prevent unbounded memory growth
     */
    startCleanupTimer() {
        // Clean up old timing entries every 30 seconds
        this.cleanupTimer = setInterval(() => {
            this.cleanupTimingEntries();
        }, 30000);
    }

    /**
     * Clean up old timing entries to prevent memory leaks
     */
    cleanupTimingEntries() {
        const now = Date.now();
        const maxAge = 60000; // 1 minute max age
        
        // Clean up entries older than maxAge or enforce maxTimingEntries limit
        if (this.messageStartTimes.size > this.options.maxTimingEntries) {
            const entries = Array.from(this.messageStartTimes.entries());
            
            // Sort by timestamp and remove oldest entries
            entries.sort((a, b) => a[1] - b[1]);
            const toRemove = entries.slice(0, entries.length - this.options.maxTimingEntries);
            
            toRemove.forEach(([key]) => {
                this.messageStartTimes.delete(key);
            });
            
            if (this.options.enableDetailedLogging) {
                console.log(`🧹 Cleaned up ${toRemove.length} old timing entries`);
            }
        }
        
        // Also clean up very old entries regardless of size
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

    /**
     * Process message batch for performance
     */
    processBatch() {
        if (this.messageBatch.length === 0) return;
        
        const batch = this.messageBatch.splice(0, this.options.batchSize);
        
        // Process batched messages
        batch.forEach(({ nodeId, nodeType, flowId, type }) => {
            this.metricsCollector.recordMessage(nodeId, nodeType, flowId);
        });
        
        // Schedule next batch if there are more messages
        if (this.messageBatch.length > 0) {
            this.batchTimer = setTimeout(() => this.processBatch(), this.options.flushInterval);
        } else {
            this.batchTimer = null;
        }
    }

    /**
     * Add message to batch for performance
     */
    addToBatch(nodeId, nodeType, flowId, type) {
        this.messageBatch.push({ nodeId, nodeType, flowId, type });
        
        // Process batch if it's full or start timer if not already running
        if (this.messageBatch.length >= this.options.batchSize) {
            this.processBatch();
        } else if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => this.processBatch(), this.options.flushInterval);
        }
    }

    /**
     * Set up official Node-RED hooks for comprehensive monitoring
     */
    setupOfficialHooks() {
        console.log('🔧 Setting up official Node-RED hooks...');
        
        // Hook into message sending (onSend)
        if (this.RED.hooks) {
            const onSendHook = this.RED.hooks.add('onSend', (sendEvents) => {
                sendEvents.forEach((sendEvent) => {
                    this.handleSendEvent(sendEvent);
                });
            });
            this.registeredHooks.push({ type: 'onSend', hook: onSendHook });
            console.log('✅ onSend hook registered');
        }
        
        // Hook into message receiving (onReceive)
        if (this.RED.hooks) {
            const onReceiveHook = this.RED.hooks.add('onReceive', (receiveEvent) => {
                this.handleReceiveEvent(receiveEvent);
            });
            this.registeredHooks.push({ type: 'onReceive', hook: onReceiveHook });
            console.log('✅ onReceive hook registered');
        }
        
        // Hook into node completion (onComplete)
        if (this.RED.hooks) {
            const onCompleteHook = this.RED.hooks.add('onComplete', (completeEvent) => {
                this.handleCompleteEvent(completeEvent);
            });
            this.registeredHooks.push({ type: 'onComplete', hook: onCompleteHook });
            console.log('✅ onComplete hook registered');
        }
        
        console.log(`✅ Successfully registered ${this.registeredHooks.length} official hooks`);
    }

    /**
     * Handle message send events
     * @param {Object} sendEvent - Send event from Node-RED
     */
    handleSendEvent(sendEvent) {
        try {
            // Extract node information from the event
            const node = sendEvent.source?.node || sendEvent.source;
            const nodeId = node?.id || sendEvent.source?.id || 'unknown';
            const nodeType = node?.type || sendEvent.source?.type || 'unknown';
            const flowId = node?.z || sendEvent.source?.z || 'unknown';
            const messageId = sendEvent.msg?._msgid || this.generateMessageId();
            
            if (this.options.enableDetailedLogging) {
                console.log(`📤 Node ${nodeType} (${nodeId}) sending message`);
            }
            
            try {
                // Record message
                this.metricsCollector.recordMessage(nodeId, nodeType, flowId);
                
                // Add to batch for processing
                this.addToBatch(nodeId, nodeType, flowId, 'send');
                
                // Record timing start
                const timingKey = `${nodeId}_${messageId}`;
                this.messageStartTimes.set(timingKey, Date.now());
                
            } catch (error) {
                // Record processing error
                this.metricsCollector.recordError(nodeId, nodeType, flowId, 'send_processing');
                if (this.options.enableDetailedLogging) {
                    console.log(`❌ Error processing send event for ${nodeType} (${nodeId}): ${error.message}`);
                }
            }
            
        } catch (error) {
            console.log('❌ Error handling send event:', error.message);
        }
    }

    /**
     * Handle message receive events
     * @param {Object} receiveEvent - Receive event from Node-RED
     */
    handleReceiveEvent(receiveEvent) {
        try {
            // Extract node information from the event
            const node = receiveEvent.destination?.node || receiveEvent.destination;
            const nodeId = node?.id || receiveEvent.destination?.id || 'unknown';
            const nodeType = node?.type || receiveEvent.destination?.type || 'unknown';
            const flowId = node?.z || receiveEvent.destination?.z || 'unknown';
            
            if (this.options.enableDetailedLogging) {
                console.log(`📥 Node ${nodeType} (${nodeId}) received message`);
            }
            
            try {
                // Add to batch for processing
                this.addToBatch(nodeId, nodeType, flowId, 'receive');
                
                // Record timing start for this node
                const messageId = receiveEvent.msg?._msgid || this.generateMessageId();
                const timingKey = `${nodeId}_${messageId}`;
                this.messageStartTimes.set(timingKey, Date.now());
                
            } catch (error) {
                // Record processing error
                this.metricsCollector.recordError(nodeId, nodeType, flowId, 'receive_processing');
                if (this.options.enableDetailedLogging) {
                    console.log(`❌ Error processing receive event for ${nodeType} (${nodeId}): ${error.message}`);
                }
            }
            
        } catch (error) {
            console.log('❌ Error handling receive event:', error.message);
        }
    }

    /**
     * Handle node completion events
     * @param {Object} completeEvent - Complete event from Node-RED
     */
    handleCompleteEvent(completeEvent) {
        try {
            // Extract node information from the event
            const node = completeEvent.node?.node || completeEvent.node;
            const nodeId = node?.id || completeEvent.node?.id || 'unknown';
            const nodeType = node?.type || completeEvent.node?.type || 'unknown';
            const flowId = node?.z || completeEvent.node?.z || 'unknown';
            const messageId = completeEvent.msg?._msgid || 'unknown';
            
            if (this.options.enableDetailedLogging) {
                console.log(`✅ Node ${nodeType} (${nodeId}) completed processing`);
            }
            
            try {
                // Add to batch for processing
                this.addToBatch(nodeId, nodeType, flowId, 'complete');
                
                // Calculate execution time if we have timing data
                const timingKey = `${nodeId}_${messageId}`;
                const startTime = this.messageStartTimes.get(timingKey);
                
                if (startTime) {
                    const executionTime = (Date.now() - startTime) / 1000; // Convert to seconds
                    if (this.options.enableDetailedLogging) {
                        console.log(`⏱️  Node ${nodeType} (${nodeId}) total processing time: ${(executionTime * 1000).toFixed(3)}ms`);
                    }
                    
                    // Record execution time
                    this.metricsCollector.recordNodeExecution(nodeId, nodeType, flowId, executionTime);
                    
                    // Clean up timing data
                    this.messageStartTimes.delete(timingKey);
                }
                
                // Handle error information if present in complete event
                if (completeEvent.error) {
                    const errorType = completeEvent.error.name || 'execution';
                    this.metricsCollector.recordError(nodeId, nodeType, flowId, errorType);
                    
                    if (this.options.enableDetailedLogging) {
                        console.log(`❌ Node ${nodeType} (${nodeId}) completed with error: ${errorType}`);
                    }
                }
                
            } catch (error) {
                // Record processing error
                this.metricsCollector.recordError(nodeId, nodeType, flowId, 'complete_processing');
                if (this.options.enableDetailedLogging) {
                    console.log(`❌ Error processing complete event for ${nodeType} (${nodeId}): ${error.message}`);
                }
            }
            
        } catch (error) {
            console.log('❌ Error handling complete event:', error.message);
        }
    }

    /**
     * Fallback to event-based monitoring if hooks are not available
     */
    setupEventBasedHooks() {
        console.log('🔧 Setting up event-based hooks as fallback...');
        
        try {
            if (this.RED.events) {
                console.log('🎯 Setting up RED.events listeners...');
                
                // Listen for runtime events
                this.RED.events.on('runtime-event', (event) => {
                    console.log('🚀 Runtime event:', event);
                    if (event.id === 'flows-started') {
                        this.collectFlowMetrics();
                        this.hookIntoActiveNodes();
                    }
                });
                
                // Listen for flows events
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
                
                // Listen for node errors
                this.RED.events.on('node-error', (event) => {
                    this.handleNodeError(event);
                });
                
                // Listen for flow errors
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

    /**
     * Handle node error events from RED.events
     * @param {Object} event - Node error event
     */
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

    /**
     * Handle flow error events from RED.events
     * @param {Object} event - Flow error event
     */
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

    /**
     * Hook into active nodes (simplified)
     */
    hookIntoActiveNodes() {
        try {
            if (this.options.enableDetailedLogging) {
                console.log('🔧 Node hooking disabled - using official hooks instead');
            }
            
            // The official hooks (onSend, onReceive, onComplete) provide all the 
            // individual node monitoring we need, so manual hooking is unnecessary
            
        } catch (error) {
            console.log('❌ Error in node hooking:', error.message);
        }
    }

    /**
     * Generate a unique message ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Start periodic metric collection
     */
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

    /**
     * Collect initial metrics
     */
    collectInitialMetrics() {
        console.log('📊 Collecting initial metrics...');
        
        try {
            this.collectRuntimeMetrics();
            this.collectFlowMetrics();
            this.collectNodeTypeMetrics();
            
            // Hook into active nodes after a short delay (fallback only)
            if (!this.RED.hooks || typeof this.RED.hooks.add !== 'function') {
                setTimeout(() => this.hookIntoActiveNodes(), 2000);
            }
        } catch (error) {
            console.log('❌ Error collecting initial metrics:', error.message);
        }
    }

    /**
     * Collect runtime information
     */
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

    /**
     * Collect flow metrics from real data
     */
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

    /**
     * Collect node type metrics from real data
     */
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

    /**
     * Update system metrics
     */
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

    /**
     * Stop all hooks and cleanup
     */
    stop() {
        if (this.options.enableDetailedLogging) {
            console.log('🛑 Stopping Node-RED hooks...');
        }
        
        // Clear periodic updates
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // Clear cleanup timer
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        // Clear batch timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        
        // Process any remaining batched messages
        this.processBatch();
        
        // Clear message tracking
        this.messageStartTimes.clear();
        this.messageBatch = [];
        
        // TODO: Remove official hooks when Node-RED provides hook removal API
        this.registeredHooks = [];
        
        this.isInitialized = false;
        
        if (this.options.enableDetailedLogging) {
            console.log('✅ Node-RED hooks stopped');
        }
    }
}

module.exports = NodeRedHooks; 