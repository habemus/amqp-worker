// third-party
const amqplib  = require('amqplib');
const Bluebird = require('bluebird');

module.exports = function setupMQTopology(connection, options) {

  var exchangeName     = options.exchangeName;
  var taskQueueName    = options.taskQueueName;
  var resultsQueueName = options.resultsQueueName;

  if (!exchangeName || !taskQueueName || !resultsQueueName) {
    throw new Error('required options');
  }
  
  var _channel;

  return connection.createConfirmChannel()
    .then((channel) => {

      _channel = channel;

      return Bluebird.all([
        /**
         * Queue at which task execution requests will be stored.
         */
        channel.assertQueue(taskQueueName),
        /**
         * Queue at which the results will be stored.
         */
        channel.assertQueue(resultsQueueName),
        /**
         * Exchange for both queues.
         */
        channel.assertExchange(exchangeName, 'direct'),
        /**
         * Bind the taskQueue to the exchange using
         * the taskQueueName itself as the routingKey
         */
        channel.bindQueue(taskQueueName, exchangeName, taskQueueName),
        /**
         * Bind the resultsQueue to the exchange using
         * the resultsQueueName itself as the routingKey
         */
        channel.bindQueue(resultsQueueName, exchangeName, resultsQueueName)
      ])
    })
    .then(() => {
      return _channel;
    });
};
