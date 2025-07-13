/**
 * Node-RED Flow Metrics Node
 * A custom node that provides comprehensive Node-RED monitoring
 */

module.exports = function(RED) {
    "use strict";
    
    const NodeRedFlowMetrics = require('../index.js');
    
    // Global metrics instance - only one per Node-RED instance
    let globalMetrics = null;
    let isServerRunning = false;
    
    function FlowMetricsNode(config) {
        RED.nodes.createNode(this, config);
        
        const node = this;
        
        // Extract configuration with defaults
        const metricsConfig = {
            host: config.host || '0.0.0.0',
            port: config.port || 1881,
            metricsRoute: config.metricsRoute || '/metrics',
            jsonRoute: config.jsonRoute || '/metrics/json',
            healthRoute: config.healthRoute || '/health',
            collectInterval: config.collectionInterval || 5000,
            enableDetailedLogging: config.enableDetailedLogging || false,
            maxTimingEntries: config.maxTimingEntries || 1000
        };
        
        console.log('🚀 Flow Metrics Node starting with config:', metricsConfig);
        
        // Track test messages
        let messageCount = 0;
        let lastMessageTime = Date.now();
        
        // Method to set up message tracking
        node.setupMessageTracking = function() {
            if (metricsConfig.enableDetailedLogging) {
                console.log('🔧 Setting up message tracking...');
            }
            
            try {
                // Hook into Node-RED's message flow
                if (RED.events) {
                    // Listen for node events
                    RED.events.on('node-send', (eventData) => {
                        if (metricsConfig.enableDetailedLogging) {
                            console.log('📤 Node send event:', eventData);
                        }
                        node.handleMessageEvent('send', eventData);
                    });
                    
                    RED.events.on('node-receive', (eventData) => {
                        if (metricsConfig.enableDetailedLogging) {
                            console.log('📥 Node receive event:', eventData);
                        }
                        node.handleMessageEvent('receive', eventData);
                    });
                    
                    if (metricsConfig.enableDetailedLogging) {
                        console.log('✅ Message tracking setup complete');
                    }
                } else {
                    console.log('⚠️ RED.events not available for message tracking');
                }
                
                // Try to hook into existing nodes
                node.hookExistingNodes();
                
            } catch (error) {
                console.log('❌ Error setting up message tracking:', error.message);
            }
        };
        
        // Method to handle message events
        node.handleMessageEvent = function(eventType, data) {
            try {
                messageCount++;
                lastMessageTime = Date.now();
                
                if (metricsConfig.enableDetailedLogging) {
                    console.log(`📊 Message ${eventType}:`, {
                        type: eventType,
                        data: data,
                        count: messageCount,
                        time: lastMessageTime
                    });
                }
                
                // Update status periodically, not on every message for performance
                if (messageCount % 10 === 0) {
                    node.status({
                        fill: "green",
                        shape: "dot",
                        text: `Server: ${metricsConfig.host}:${metricsConfig.port}`
                    });
                }
                
            } catch (error) {
                console.log('❌ Error handling message event:', error.message);
            }
        };
        
        // Method to hook into existing nodes
        node.hookExistingNodes = function() {
            if (metricsConfig.enableDetailedLogging) {
                console.log('🔍 Hooking into existing nodes...');
            }
            
            try {
                // This is where we would hook into existing nodes
                // Implementation depends on Node-RED internals
                
            } catch (error) {
                console.log('❌ Error hooking existing nodes:', error.message);
            }
        };
        
        // Method to monitor messages (optimized for performance)
        node.monitorMessages = function() {
            if (metricsConfig.enableDetailedLogging) {
                console.log(`📊 Message count in last ${metricsConfig.collectInterval}ms: ${messageCount}`);
            }
            
            // Update status with metrics server info
            const metricsUrl = `${metricsConfig.host}:${metricsConfig.port}${metricsConfig.metricsRoute}`;
            node.status({
                fill: "green",
                shape: "dot",
                text: `Metrics: ${metricsUrl}`
            });
            
            // Reset message count
            messageCount = 0;
        };
        
        // Initialize metrics if not already done
        if (!globalMetrics) {
            console.log('🔧 Initializing metrics system...');
            
            // Create metrics instance with configuration
            globalMetrics = new NodeRedFlowMetrics({
                host: metricsConfig.host,
                port: metricsConfig.port,
                metricsRoute: metricsConfig.metricsRoute,
                jsonRoute: metricsConfig.jsonRoute,
                healthRoute: metricsConfig.healthRoute,
                collectInterval: metricsConfig.collectInterval,
                enableDetailedLogging: metricsConfig.enableDetailedLogging,
                maxTimingEntries: metricsConfig.maxTimingEntries
            });
            
            // Initialize with Node-RED runtime
            globalMetrics.init(RED).then(() => {
                console.log('✅ Metrics system initialized');
                isServerRunning = true;
                node.setupMessageTracking();
            }).catch(error => {
                console.error('❌ Failed to initialize metrics:', error);
                node.status({fill:"red", shape:"ring", text:"initialization failed"});
            });
            
        } else {
            console.log('ℹ️ Metrics already initialized, skipping...');
        }
        
        // Set initial status
        node.status({fill:"green", shape:"dot", text:"Starting metrics server..."});
        
        // Start monitoring messages with configurable interval
        const monitorInterval = setInterval(() => {
            node.monitorMessages();
        }, metricsConfig.collectInterval);
        
        // Handle node cleanup
        node.on('close', function() {
            console.log('🧹 Flow Metrics node closing...');
            if (monitorInterval) {
                clearInterval(monitorInterval);
            }
            node.status({});
        });
    }
    
    // Register the node type
    RED.nodes.registerType("flow-metrics", FlowMetricsNode);
    
    // Clean up when Node-RED shuts down
    RED.events.on('runtime-event', function(event) {
        if (event.id === 'runtime-stopped' && globalMetrics) {
            console.log('🛑 Shutting down metrics on runtime stop');
            globalMetrics.stop();
            globalMetrics = null;
            isServerRunning = false;
        }
    });
}; 