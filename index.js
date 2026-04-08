const MetricsCollector = require('./lib/metrics-collector');
const NodeRedHooks = require('./lib/node-red-hooks');
const PrometheusExporter = require('./lib/prometheus-exporter');

class NodeRedFlowMetrics {
    constructor(options = {}) {
        this.options = {
            host: '0.0.0.0',
            port: 1881,
            metricsRoute: '/metrics',
            jsonRoute: '/metrics/json',
            healthRoute: '/health',
            collectInterval: 5000,
            enableDetailedLogging: false,
            maxTimingEntries: 1000,
            batchSize: 100,
            flushInterval: 1000,
            ...options
        };

        this.metricsCollector = new MetricsCollector(this.options);
        this.nodeRedHooks = new NodeRedHooks(this.metricsCollector, this.options);
        this.prometheusExporter = new PrometheusExporter(this.metricsCollector, this.options);

        this.isInitialized = false;
        this.isServerRunning = false;

        if (this.options.enableDetailedLogging) {
            console.log('Initializing Node-RED Flow Metrics with options:', this.options);
        } else {
            console.log('Initializing Node-RED Flow Metrics...');
        }
    }

    async init(RED) {
        if (this.isInitialized) {
            if (this.options.enableDetailedLogging) {
                console.log('Metrics system already initialized, skipping...');
            }
            return;
        }

        try {
            if (this.options.enableDetailedLogging) {
                console.log('🔧 Initializing metrics system...');
            }

            await this.nodeRedHooks.init(RED);

            this.metricsCollector.start();

            if (!this.isServerRunning) {
                await this.prometheusExporter.start(
                    this.options.host,
                    this.options.port,
                    this.options.metricsRoute,
                    this.options.jsonRoute,
                    this.options.healthRoute
                );
                this.isServerRunning = true;

                const serverUrl = `http://${this.options.host}:${this.options.port}`;
                console.log(`✅ Node-RED Flow Metrics server running at ${serverUrl}${this.options.metricsRoute}`);

                if (this.options.enableDetailedLogging) {
                    console.log(`📊 Metrics endpoint: ${serverUrl}${this.options.metricsRoute}`);
                    console.log(`📋 JSON endpoint: ${serverUrl}${this.options.jsonRoute}`);
                    console.log(`💚 Health endpoint: ${serverUrl}${this.options.healthRoute}`);
                }
            }

            this.isInitialized = true;

            if (this.options.enableDetailedLogging) {
                console.log('✅ Metrics system fully initialized');
            }

        } catch (error) {
            if (error.code === 'EADDRINUSE') {
                console.log(`Port ${this.options.port} already in use, metrics server already running`);
                this.isServerRunning = true;
                this.isInitialized = true;
                return;
            }

            console.error('❌ Failed to initialize metrics system:', error.message);
            throw error;
        }
    }

    async stop() {
        try {
            if (this.options.enableDetailedLogging) {
                console.log('🛑 Stopping metrics system...');
            }

            if (this.nodeRedHooks) {
                await this.nodeRedHooks.stop();
            }

            if (this.prometheusExporter && this.isServerRunning) {
                await this.prometheusExporter.stop();
                this.isServerRunning = false;
            }

            this.isInitialized = false;

            if (this.options.enableDetailedLogging) {
                console.log('✅ Metrics system stopped');
            }

        } catch (error) {
            console.error('❌ Error stopping metrics system:', error.message);
            throw error;
        }
    }

    getMetrics() {
        if (!this.isInitialized) {
            throw new Error('Metrics system not initialized');
        }
        return this.metricsCollector.getRegistry().metrics();
    }

    getRegistry() {
        return this.metricsCollector.getRegistry();
    }

    recordError(nodeId, nodeType, flowId, errorType, nodeName = '', flowName = '') {
        if (this.isInitialized && this.metricsCollector) {
            this.metricsCollector.recordError(nodeId, nodeType, flowId, errorType, nodeName, flowName);
        }
    }

    isReady() {
        return this.isInitialized && this.isServerRunning;
    }

    getConfig() {
        return { ...this.options };
    }
}

module.exports = NodeRedFlowMetrics; 