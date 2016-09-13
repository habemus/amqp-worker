// native
const EventEmitter = require('events').EventEmitter;
const util = require('util');

// third-party
const amqplib  = require('amqplib');
const Bluebird = require('bluebird');
const uuid     = require('uuid');

function HWorkerServer(options, fn) {
  EventEmitter.call(this);

  if (!options.rabbitMQURI) {
    throw new Error('rabbitMQURI is required');
  }

  fn = fn || this.fn;

  if (typeof fn !== 'function') {
    throw new TypeError('fn MUST be a Function');
  }

  this.rabbitMQURI = options.rabbitMQURI;
  this.fn = fn;

  var taskName = this.taskName || options.taskName;

  if (!taskName) {
    throw new Error('taskName is required');
  }

  this.taskExchangeName = taskName + '-exchange';
  this.taskQueueName    = taskName;

  this.appId            = options.appId || uuid.v4();

  // bind methods to the instance
  this.handleMessage = this.handleMessage.bind(this);
  this.handleError   = this.handleError.bind(this);

  this.log   = this.log.bind(this);
  this.info  = this.info.bind(this);
  this.warn  = this.warn.bind(this);
  this.error = this.error.bind(this);
}

util.inherits(HWorkerServer, EventEmitter);

/**
 * Connects to the rabbitMQURI specified upon instantiation
 * creates a channel and sets up required topology
 * for the worker.
 * 
 * @return {Bluebird -> HWorkerServer}
 */
HWorkerServer.prototype.connect = function () {

  var rabbitMQURI      = this.rabbitMQURI;
  var taskQueueName    = this.taskQueueName;
  var taskExchangeName = this.taskExchangeName;

  var _channel;

  return Bluebird.resolve(amqplib.connect(rabbitMQURI))
    .then((connection) => {
      return connection.createChannel();
    })
    .then((channel) => {
      _channel = channel;

      return Bluebird.all([
        /**
         * Queue at which task execution requests will be stored.
         */
        channel.assertQueue(taskQueueName),
        /**
         * Exchange for both queues.
         */
        channel.assertExchange(taskExchangeName, 'direct'),
        /**
         * Bind the taskQueue to the exchange using
         * the taskQueueName itself as the routingKey
         */
        channel.bindQueue(taskQueueName, taskExchangeName, taskQueueName),

      ]);
    })
    .then(() => {
      this.channel = _channel;

      this.channel.consume(this.taskQueueName, this.handleMessage, {
        /**
         * Require ack
         * @type {Boolean}
         */
        noAck: false,
        /**
         * Not exclusive, we want rabbitMQ to load balance
         * messages among available worker instances.
         * @type {Boolean}
         */
        exclusive: false,
      });

      return this;
    });
};

/**
 * Handles the incoming message from rabbitMQ.
 * Attempts to parse the message as JSON.
 *
 * If the content type defiend in the message.properties
 * is unsupported, nacks the message and ignores it.
 *
 * If there is an error parsing the message as JSON,
 * nacks it and ignores it.
 *
 * Once message parsing is done, executes the worker's fn.
 * 
 * @param  {Object} message
 * @return {Bluebird}
 */
HWorkerServer.prototype.handleMessage = function (message) {

  if (!message) {
    // empty messages should be ignored
    return;
  } 

  var properties = message.properties;

  if (!properties.contentType === 'application/json') {
    this.error(message, new Error('unsupported content type'));

    // message format is not supported,
    // thus should be ignored.
    // Do not requeue

    // http://www.squaremobius.net/amqp.node/channel_api.html#channel_nack
    // #nack(message, [allUpTo, [requeue]])
    this.channel.nack(message, false, false);

    return;
  }

  try {
    var payload = JSON.parse(message.content.toString());
  } catch (e) {

    this.error(message, e);

    // error parsing message contents
    // should not requeue
    this.channel.nack(message, false, false);

  }

  /**
   * Execute the worker function
   */
  return Bluebird.resolve(this.fn(payload, this))
    .then(this.respond.bind(this, message))
    .catch(this.handleError.bind(this, message));
};

/**
 * Handles an error.
 * By default nacks the sourceMessage and throws the error.
 * Should be implemented by actual workers.
 * 
 * @param  {Object} sourceMessage
 * @param  {Error} err
 */
HWorkerServer.prototype.handleError = function (sourceMessage, err) {
  this.error(sourceMessage, err);

  this.channel.nack(sourceMessage, false, false);

  throw err;
};

/**
 * Assign messaging methods to the HWorkerServer's prototype
 */
Object.assign(HWorkerServer.prototype, require('./messaging'));

module.exports = HWorkerServer;
