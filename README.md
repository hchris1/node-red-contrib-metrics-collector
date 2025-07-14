# node-red-contrib-metrics-collector

A monitoring integration that provides detailed metrics about your flows, nodes, and system performance. Export metrics in Prometheus format for integration with monitoring dashboards like Grafana.

## Features

- **Flow Monitoring**: Track active flows, total flows, and flow status
- **Node Metrics**: Monitor message processing, execution times, and error rates per node
- **System Metrics**: CPU, memory, and Node.js process metrics
- **Prometheus Export**: Industry-standard metrics format for monitoring systems
- **JSON API**: Human-readable metrics endpoint
- **Health Checks**: Built-in health monitoring endpoint

## Installation

```bash
npm install node-red-contrib-metrics-collector
```

Or install directly in Node-RED:
1. Go to Menu → Manage Palette → Install
2. Search for `node-red-contrib-metrics-collector`
3. Click Install

## Quick Start

1. Drag the **Flow Metrics** node from the monitoring category to your flow
2. Configure the node settings (host, port, routes)
3. Deploy your flow
4. Access metrics at `http://localhost:1881/metrics`

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| **Name** | - | Optional name for the node |
| **Host** | `0.0.0.0` | Server host (use 0.0.0.0 for Docker) |
| **Port** | `1881` | Server port for metrics endpoint |
| **Metrics Route** | `/metrics` | Prometheus metrics endpoint |
| **JSON Route** | `/metrics/json` | Human-readable JSON metrics |
| **Health Route** | `/health` | Health check endpoint |
| **Collection Interval** | `5000` | Metrics collection interval (ms) |
| **Max Timing Entries** | `1000` | Maximum timing entries in memory |
| **Detailed Logging** | `false` | Enable verbose console logging |

## Metrics Endpoints

- Prometheus Metrics (`/metrics`)
- JSON Metrics (`/metrics/json`)
-  Health Check (`/health`)
