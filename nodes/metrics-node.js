module.exports = function (RED) {
    "use strict";

    const NodeRedFlowMetrics = require('../index.js');

    let globalMetrics = null;

    function FlowMetricsNode(config) {
        RED.nodes.createNode(this, config);

        const node = this;

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

        let messageCount = 0;
        let lastMessageTime = Date.now();

        node.setupMessageTracking = function () {
            if (metricsConfig.enableDetailedLogging) {
                console.log('🔧 Setting up message tracking...');
            }

            try {
                if (RED.events) {
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

                node.hookExistingNodes();

            } catch (error) {
                console.log('❌ Error setting up message tracking:', error.message);
            }
        };

        node.handleMessageEvent = function (eventType, data) {
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

        node.monitorMessages = function () {
            if (metricsConfig.enableDetailedLogging) {
                console.log(`📊 Message count in last ${metricsConfig.collectInterval}ms: ${messageCount}`);
            }

            const metricsUrl = `${metricsConfig.host}:${metricsConfig.port}${metricsConfig.metricsRoute}`;
            node.status({
                fill: "green",
                shape: "dot",
                text: `Metrics: ${metricsUrl}`
            });

            messageCount = 0;
        };

        if (!globalMetrics) {
            console.log('🔧 Initializing metrics system...');

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

            globalMetrics.init(RED).then(() => {
                console.log('✅ Metrics system initialized');
                isServerRunning = true;
                node.setupMessageTracking();
            }).catch(error => {
                console.error('❌ Failed to initialize metrics:', error);
                node.status({ fill: "red", shape: "ring", text: "initialization failed" });
            });

        } else {
            console.log('ℹ️ Metrics already initialized, skipping...');
        }

        node.status({ fill: "green", shape: "dot", text: "Starting metrics server..." });

        const monitorInterval = setInterval(() => {
            node.monitorMessages();
        }, metricsConfig.collectInterval);

        node.on('close', function () {
            console.log('🧹 Flow Metrics node closing...');
            if (monitorInterval) {
                clearInterval(monitorInterval);
            }
            node.status({});
        });
    }

    RED.nodes.registerType("flow-metrics", FlowMetricsNode);

    RED.events.on('runtime-event', function (event) {
        if (event.id === 'runtime-stopped' && globalMetrics) {
            console.log('🛑 Shutting down metrics on runtime stop');
            globalMetrics.stop();
            globalMetrics = null;
            isServerRunning = false;
        }
    });
}; 