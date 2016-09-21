// native
const EventEmitter = require('events').EventEmitter;
const util = require('util');

// third-party
const amqplib  = require('amqplib');
const Bluebird = require('bluebird');
const uuid     = require('uuid');

// own
const errors = require('../shared/errors');

/**
 * HWorkerClient constructor
 * @param {Object} options
 */
function HWorkerClient(options) {
  EventEmitter.call(this);

  options = options || {};

  this.name = options.name || this.name;

  if (!this.name) {
    throw new errors.InvalidOption('name', 'required');
  }

  this.workerExchangeName = this.name + '-exchange';
  this.workerQueueName    = this.name;

  this.appId            = options.appId || uuid.v4();
  this.updatesQueueName = this.name + '-updates-' + this.appId;

  // bind methods to the instance
  this.handleUpdateMessage = this.handleUpdateMessage.bind(this);
}

util.inherits(HWorkerClient, EventEmitter);

/**
 * Make errors available both in constructor as a static property
 * and at the instance's protypical inheritance chain.
 * 
 * @type {Object}
 */
HWorkerClient.prototype.errors = errors;
HWorkerClient.errors = errors;

/**
 * Connects to the rabbitMQURI specified upon instantiation
 * creates a channel and sets up required topology
 * for the worker.
 *
 * If given a String, will assume it is an amqp URI and use
 * amqplib.connect(uri) method to create a connection.
 *
 * If given a non-String, will assume it is an amqplib connection
 * and use it straightforward.
 *
 * @param {String|Connection} connectionOrURI
 * @return {Bluebird -> self}
 */
HWorkerClient.prototype.connect = function (connectionOrURI) {

  if (!connectionOrURI) {
    return Bluebird.reject(new errors.InvalidOption('connectionOrURI', 'required'));
  }

  var workerExchangeName = this.workerExchangeName;
  var workerQueueName    = this.workerQueueName;
  var updatesQueueName   = this.updatesQueueName;

  var _channel;

  var connectionPromise = (typeof connectionOrURI === 'string') ?
    Bluebird.resolve(amqplib.connect(connectionOrURI)) :
    Bluebird.resolve(connectionOrURI);

  return connectionPromise.then((connection) => {

    this.connection = connection;

    return connection.createConfirmChannel();
  })
  .then((channel) => {
    _channel = channel;

    return Bluebird.all([
      /**
       * Queue at which execution requests will be stored.
       */
      channel.assertQueue(workerQueueName),
      /**
       * Queue at which the updates will be stored.
       */
      channel.assertQueue(updatesQueueName),
      /**
       * Exchange for both queues.
       */
      channel.assertExchange(workerExchangeName, 'direct'),
      /**
       * Bind the workerQueue to the exchange using
       * the workerQueueName itself as the routingKey
       */
      channel.bindQueue(workerQueueName, workerExchangeName, workerQueueName),
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
  })
  .then(() => {
    return this;
  });

};

HWorkerClient.prototype.schedule = function (data) {
  if (!this.channel) {
    throw new errors.NotConnected('not connected');
  }

  var requestId = uuid.v4();

  data = data || {};
  data = JSON.stringify(data);
  data = new Buffer(data);

  var published = this.channel.publish(this.workerExchangeName, this.workerQueueName, data, {
    persistent: true,
    mandatory: true,
    contentType: 'application/json',
    contentEncoding: 'utf8',
    replyTo: this.updatesQueueName,
    messageId: requestId,
    timestamp: Date.now(),
    type: 'work-request',
    appId: this.appId,
  });

  // TBD: handle cases when published is false
  // http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish

  return Bluebird.resolve(requestId);
};

/**
 * Handles messages incoming from the rabbitMQ server
 * 
 * @param  {Object} message
 *         - properties
 *         - content
 */
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
    case 'result:success':
      this.emit('result:success', requestId, payload);
      break;
    case 'result:error':
      this.emit('result:error', requestId, payload);
      break;
    case 'log:info':
      this.emit('log:info', requestId, payload);
      break;
    case 'log:warning':
      this.emit('log:warning', requestId, payload);
      break;
    case 'log:error':
      this.emit('log:error', requestId, payload);
      break;
    default:
      console.warn('unkown workload update type', message);
      break;
  }
};

module.exports = HWorkerClient;
