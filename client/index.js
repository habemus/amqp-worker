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
  this.updatesQueueName = taskName + '-updates-' + this.appId;

  // bind methods to the instance
  this.handleUpdateMessage = this.handleUpdateMessage.bind(this);
}

util.inherits(HWorkerClient, EventEmitter);

HWorkerClient.prototype.connect = function () {

  var rabbitMQURI      = this.rabbitMQURI;
  var taskExchangeName = this.taskExchangeName;
  var taskQueueName    = this.taskQueueName;
  var updatesQueueName = this.updatesQueueName;

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
         * Queue at which the updates will be stored.
         */
        channel.assertQueue(updatesQueueName),
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
         * Bind the updatesQueue to the exchange using
         * the updatesQueueName itself as the routingKey
         */
        channel.bindQueue(updatesQueueName, taskExchangeName, updatesQueueName)
      ]);
    })
    .then(() => {
      this.channel = _channel;

      // consume from the updates queue
      return this.channel.consume(updatesQueueName, this.handleUpdateMessage, {
        /**
         * Do not require ack, as the messages
         * will not trigger actions from the server.
         * @type {Boolean}
         */
        noAck: true,
        /**
         * Make sure it is an exclusive queue, so that
         * only this client can consume from it.
         *
         * That is so because the updates are directed at the issuer
         * 
         * @type {Boolean}
         */
        exclusive: true,
      });

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

  var published = this.channel.publish(this.taskExchangeName, this.taskQueueName, data, {
    persistent: true,
    mandatory: true,
    contentType: 'application/json',
    contentEncoding: 'utf8',
    replyTo: this.updatesQueueName,
    messageId: requestId,
    timestamp: Date.now(),
    type: 'job-request',
    appId: this.appId,
  });

  // TBD: handle cases when published is false
  // http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish

  return Bluebird.resolve(requestId);
};

HWorkerClient.prototype.handleUpdateMessage = function (message) {

  if (!message || !message.properties || !message.properties.correlationId) {
    return;
  }

  var requestId = message.properties.correlationId;
  var payload;

  if (message.properties.contentType === 'application/json') {
    payload = JSON.parse(message.content.toString());
  } else {
    payload = message.content;
  }

  switch (message.properties.type) {
    case 'result':
      this.emit('workload-result', requestId, payload);
      break;
    case 'log:info':
      this.emit('workload-info', requestId, payload);
      break;
    case 'log:warning':
      this.emit('workload-warning', requestId, payload);
      break;
    case 'log:error':
      this.emit('workload-error', requestId, payload);
      break;
    default:
      console.warn('unkown workload update type', message);
      break;
  }
};

module.exports = HWorkerClient;
