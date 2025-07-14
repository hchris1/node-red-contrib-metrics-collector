const express = require('express');

class PrometheusExporter {
    constructor(metricsCollector, options = {}) {
        this.metricsCollector = metricsCollector;
        this.options = {
            host: '0.0.0.0',
            port: 1881,
            metricsRoute: '/metrics',
            jsonRoute: '/metrics/json',
            healthRoute: '/health',
            enableDetailedLogging: false,
            ...options
        };

        this.app = express();
        this.server = null;
        this.isRunning = false;

        this.app.disable('x-powered-by');
        this.app.use(express.json({ limit: '1mb' }));

        this.setupRoutes();
    }

    setupRoutes() {
        this.app.get(this.options.metricsRoute, async (req, res) => {
            try {
                const startTime = Date.now();
                const metrics = await this.metricsCollector.getMetrics();

                res.set('Content-Type', 'text/plain');
                res.end(metrics);

                if (this.options.enableDetailedLogging) {
                    const duration = Date.now() - startTime;
                    console.log(`📊 Metrics request served in ${duration}ms`);
                }
            } catch (error) {
                console.error('❌ Error getting metrics:', error.message);
                res.status(500).send('Error getting metrics');
            }
        });

        this.app.get(this.options.jsonRoute, async (req, res) => {
            try {
                const startTime = Date.now();
                const registry = this.metricsCollector.getRegistry();
                const metrics = await registry.getMetricsAsJSON();

                res.json(metrics);

                if (this.options.enableDetailedLogging) {
                    const duration = Date.now() - startTime;
                    console.log(`📋 JSON metrics request served in ${duration}ms`);
                }
            } catch (error) {
                console.error('❌ Error getting JSON metrics:', error.message);
                res.status(500).json({ error: 'Error getting metrics' });
            }
        });

        this.app.get(this.options.healthRoute, (req, res) => {
            const healthData = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                metricsCollector: this.metricsCollector ? 'running' : 'stopped',
                server: {
                    host: this.options.host,
                    port: this.options.port,
                    uptime: process.uptime()
                },
                endpoints: {
                    metrics: this.options.metricsRoute,
                    json: this.options.jsonRoute,
                    health: this.options.healthRoute
                }
            };

            res.json(healthData);

            if (this.options.enableDetailedLogging) {
                console.log('💚 Health check requested');
            }
        });

        this.app.use((req, res, next) => {
            res.status(404).json({
                error: 'Endpoint not found',
                availableEndpoints: [
                    this.options.metricsRoute,
                    this.options.jsonRoute,
                    this.options.healthRoute
                ]
            });
        });

        this.app.use((err, req, res, next) => {
            console.error('❌ Express error:', err.message);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    start(host = 'localhost', port = 1881, metricsRoute = '/metrics', jsonRoute = '/metrics/json', healthRoute = '/health') {
        return new Promise((resolve, reject) => {
            if (this.isRunning) {
                if (this.options.enableDetailedLogging) {
                    console.log('🔄 Prometheus exporter already running');
                }
                resolve();
                return;
            }

            this.options.host = host;
            this.options.port = port;
            this.options.metricsRoute = metricsRoute;
            this.options.jsonRoute = jsonRoute;
            this.options.healthRoute = healthRoute;

            try {
                this.server = this.app.listen(port, host, () => {
                    this.isRunning = true;

                    if (this.options.enableDetailedLogging) {
                        console.log(`🚀 Prometheus exporter started:`);
                        console.log(`   Host: ${host}`);
                        console.log(`   Port: ${port}`);
                        console.log(`   Metrics: http://${host}:${port}${metricsRoute}`);
                        console.log(`   JSON: http://${host}:${port}${jsonRoute}`);
                        console.log(`   Health: http://${host}:${port}${healthRoute}`);
                    }

                    resolve();
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        console.log(`⚠️  Port ${port} already in use`);
                        reject(error);
                    } else {
                        console.error('❌ Server error:', error.message);
                        reject(error);
                    }
                });

                this.server.timeout = 30000;

            } catch (error) {
                console.error('❌ Error starting Prometheus exporter:', error.message);
                reject(error);
            }
        });
    }

    stop() {
        return new Promise((resolve, reject) => {
            if (!this.isRunning || !this.server) {
                if (this.options.enableDetailedLogging) {
                    console.log('🔄 Prometheus exporter not running');
                }
                resolve();
                return;
            }

            try {
                this.server.close((error) => {
                    if (error) {
                        console.error('❌ Error stopping Prometheus exporter:', error.message);
                        reject(error);
                    } else {
                        this.isRunning = false;
                        this.server = null;

                        if (this.options.enableDetailedLogging) {
                            console.log('✅ Prometheus exporter stopped');
                        }

                        resolve();
                    }
                });
            } catch (error) {
                console.error('❌ Error stopping Prometheus exporter:', error.message);
                reject(error);
            }
        });
    }

    isServerRunning() {
        return this.isRunning;
    }

    getServerInfo() {
        return {
            isRunning: this.isRunning,
            host: this.options.host,
            port: this.options.port,
            endpoints: {
                metrics: this.options.metricsRoute,
                json: this.options.jsonRoute,
                health: this.options.healthRoute
            }
        };
    }
}

module.exports = PrometheusExporter; 