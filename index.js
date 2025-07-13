/**
 * Node-RED Flow Metrics
 * Main entry point for the monitoring package
 */

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
            // Performance optimizations
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

    /**
     * Initialize the metrics system
     * @param {Object} RED - Node-RED runtime object
     */
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
            
            // Initialize hooks with performance optimization
            await this.nodeRedHooks.init(RED);
            
            // Start metrics collection (for messages per second calculation)
            this.metricsCollector.start();
            
            // Only start server if not already running
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
            // Handle port already in use gracefully
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

    /**
     * Stop the metrics system
     */
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

    /**
     * Get current metrics in Prometheus format
     * @returns {string} Prometheus metrics
     */
    getMetrics() {
        if (!this.isInitialized) {
            throw new Error('Metrics system not initialized');
        }
        return this.metricsCollector.getRegistry().metrics();
    }

    /**
     * Get prometheus registry
     * @returns {Object} Prometheus registry
     */
    getRegistry() {
        return this.metricsCollector.getRegistry();
    }

    /**
     * Record a custom metric
     * @param {string} nodeId - Node ID
     * @param {string} nodeType - Node type
     * @param {string} flowId - Flow ID
     * @param {string} metricType - Metric type
     * @param {number} value - Metric value
     */
    recordCustomMetric(nodeId, nodeType, flowId, metricType, value) {
        if (this.isInitialized && this.metricsCollector) {
            this.metricsCollector.recordCustomMetric(nodeId, nodeType, flowId, metricType, value);
        }
    }

    /**
     * Check if metrics system is ready
     * @returns {boolean} True if ready
     */
    isReady() {
        return this.isInitialized && this.isServerRunning;
    }
    
    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.options };
    }
}

module.exports = NodeRedFlowMetrics; 