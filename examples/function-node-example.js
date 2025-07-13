/**
 * Example Function Node Code
 * Shows how to use the custom metrics collector in Node-RED function nodes
 */

// Get the metrics instance from global context
const metrics = global.get('metrics');

// Example 1: Record a custom message metric
if (metrics) {
    metrics.recordCustomMetric(node.id, node.type, msg.flowId || 'unknown', 'message');
}

// Example 2: Time a processing operation
const startTime = Date.now();

// Your processing logic here
if (msg.payload && typeof msg.payload === 'string') {
    msg.payload = msg.payload.toUpperCase();
} else {
    // Record an error if payload is invalid
    if (metrics) {
        metrics.recordCustomMetric(node.id, node.type, msg.flowId || 'unknown', 'error');
    }
    node.error('Invalid payload type', msg);
    return;
}

// Record processing time (if you had access to the metrics collector directly)
const processingTime = (Date.now() - startTime) / 1000;
// Note: Execution time is automatically recorded by our hooks

// Example 3: Access current metrics (for debugging)
if (metrics) {
    const currentMetrics = metrics.getCurrentMetrics();
    node.log('Current metrics sample: ' + currentMetrics.substring(0, 200) + '...');
}

// Example 4: Conditional metric recording
if (msg.topic === 'error') {
    if (metrics) {
        metrics.recordCustomMetric(node.id, node.type, msg.flowId || 'unknown', 'error');
    }
} else if (msg.topic === 'success') {
    if (metrics) {
        metrics.recordCustomMetric(node.id, node.type, msg.flowId || 'unknown', 'message');
    }
}

// Always return the message to continue the flow
return msg; 