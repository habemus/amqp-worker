// native
const EventEmitter = require('events').EventEmitter;
const util = require('util');

// third-party
const amqplib  = require('amqplib');
const Bluebird = require('bluebird');
const uuid     = require('uuid');

function HWorkerClient(options) {
  EventEmitter.call(this);

  if (!options.rabbitMQURI) {
    throw new Error('rabbitMQURI is required');
  }

  this.rabbitMQURI = options.rabbitMQURI;

  var taskName = this.taskName || options.taskName;

  if (!taskName) {
    throw new Error('taskName is required');
  }

  this.taskExchangeName = taskName + '-exchange';
  this.taskQueueName    = taskName;

  this.appId            = options.appId || uuid.v4();
  this.resultsQueueName = taskName + '-results-' + this.appId;
}

util.inherits(HWorkerClient, EventEmitter);

HWorkerClient.prototype.connect = function () {

  var rabbitMQURI      = this.rabbitMQURI;
  var taskExchangeName = this.taskExchangeName;
  var taskQueueName    = this.taskQueueName;
  var resultsQueueName = this.resultsQueueName;

  var _channel;

  return amqplib.connect(rabbitMQURI)
    .then((connection) => {
      return connection.createConfirmChannel();
    })
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
        channel.assertExchange(taskExchangeName, 'direct'),
        /**
         * Bind the taskQueue to the exchange using
         * the taskQueueName itself as the routingKey
         */
        channel.bindQueue(taskQueueName, taskExchangeName, taskQueueName),
        /**
         * Bind the resultsQueue to the exchange using
         * the resultsQueueName itself as the routingKey
         */
        channel.bindQueue(resultsQueueName, taskExchangeName, resultsQueueName)
      ]);
    })
    .then(() => {
      this.channel = _channel;

      return this;
    });

};

HWorkerClient.prototype.scheduleRequest = function (data) {
  if (!this.channel) {
    throw new Error('not connected');
  }

  if (!data) {
    throw new Error('data is required');
  }

  var requestId = uuid.v4();

  data = JSON.stringify(data);
  data = new Buffer(data);

  return this.channel.publish(this.taskExchangeName, this.taskQueueName, data, {
    persistent: true,
    mandatory: true,
    contentType: 'application/json',
    contentEncoding: 'utf8',
    replyTo: this.resultsQueueName,
    messageId: requestId,
    timestamp: Date.now(),
    type: 'job-request',
    appId: this.appId,
  });
};

HWorkerClient.prototype._handleResultsQueueMessage = function (message) {

  console.log('received response queue message', message);
};

module.exports = HWorkerClient;
