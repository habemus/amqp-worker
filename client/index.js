// native
const EventEmitter = require('events').EventEmitter;
const util = require('util');

// third-party
const amqplib = require('amqplib');
const uuid    = require('uuid');

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

  this.replyTo = options.replyTo || this.name + '-results';

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
 * @return {Promise -> self}
 */
HWorkerClient.prototype.connect = function (connectionOrURI) {

  if (!connectionOrURI) {
    return Promise.reject(new errors.InvalidOption('connectionOrURI', 'required'));
  }

  var workerExchangeName = this.workerExchangeName;
  var workerQueueName    = this.workerQueueName;
  var replyTo            = this.replyTo;

  var _channel;

  // check the type of the connection and act accordingly
  var connectionPromise = (typeof connectionOrURI === 'string') ?
    Promise.resolve(amqplib.connect(connectionOrURI)) :
    Promise.resolve(connectionOrURI);

  // wait for connection to be ready
  return connectionPromise.then((connection) => {

    this.connection = connection;

    return connection.createConfirmChannel();
  })
  .then((channel) => {
    _channel = channel;

    return Promise.all([
      /**
       * Queue at which execution requests will be stored.
       */
      channel.assertQueue(workerQueueName),
      /**
       * Queue at which the updates will be stored.
       */
      channel.assertQueue(replyTo),
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
    
    // propagate events
    function propagateChannelEvents(eventName, e) {
      this.emit('channel-' + eventName, e);
    }
    this.channel.on('close', propagateChannelEvents.bind(this, 'close'));
    this.channel.on('error', propagateChannelEvents.bind(this, 'error'));

    // consume from the updates queue
    return this.channel.consume(replyTo, this.handleUpdateMessage, {
      /**
       * Do not require ack, as the messages
       * will not trigger actions from the server.
       * @type {Boolean}
       */
      noAck: true,
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
    replyTo: this.replyTo,
    messageId: requestId,
    timestamp: Date.now(),
    type: 'work-request',
    appId: this.appId,
  });

  // TBD: handle cases when published is false
  // http://www.squaremobius.net/amqp.node/channel_api.html#channel_publish

  return Promise.resolve(requestId);
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
