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
 * HWorkerServer constructor function
 * 
 * @param {Object}   options
 * @param {Function} workerFn
 */
function HWorkerServer(options, workerFn) {
  EventEmitter.call(this);

  if (!options) {
    throw new errors.InvalidOption('options', 'required');
  }

  if (!options.rabbitMQURI) {
    throw new errors.InvalidOption('rabbitMQURI', 'required');
  }

  /**
   * The function that defines the workload.
   * Should return a promise if it is asynchrnous.
   *
   * Receives the rabbitMQ's message payload as the first argument
   * and a 'logger' object as the second argument.
   *
   * Has NO ACCESS to the HWorkerServer instance. It is called
   * against 'null'
   * 
   * @type {Function}
   */
  this.workerFn = workerFn || this.workerFn;

  if (typeof this.workerFn !== 'function') {
    throw new errors.InvalidOption('workerFn', 'required');
  }

  this.rabbitMQURI = options.rabbitMQURI;

  var taskName = this.taskName || options.taskName;

  if (!taskName) {
    throw new errors.InvalidOption('taskName', 'required');
  }

  this.taskExchangeName = taskName + '-exchange';
  this.taskQueueName    = taskName;

  this.appId            = options.appId || uuid.v4();

  // bind methods to the instance
  this.handleMessage = this.handleMessage.bind(this);
  this.handleError   = this.handleError.bind(this);

  this.logInfo = this.logInfo.bind(this);
  this.logWarning = this.logWarning.bind(this);
  this.logError = this.logError.bind(this);
}

util.inherits(HWorkerServer, EventEmitter);

/**
 * Expose the errors object both in the protype chain
 * and the HWorkerServer static properties
 * 
 * @type {Object}
 */
HWorkerServer.prototype.errors = errors;
HWorkerServer.errors = errors;

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

      this.connection = connection;
      
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
 * Once message parsing is done, executes the worker's workerFn.
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

  if (properties.contentType !== 'application/json') {
    this.respondError(message, new errors.UnsupportedContentType(properties.contentType));

    return;
  }

  try {
    var payload = JSON.parse(message.content.toString());
  } catch (e) {

    this.respondError(message, new errors.MalformedMessage(e.message));

    return;
  }

  /**
   * Execute the worker function
   */
  var logger = this._makeLogger(message);
  
  /**
   * Wrap it with Bluebird.try, as to ensure
   * its value is promise-chainable even if
   * the function itself does not return a promise.
   */
  return Bluebird.try(this.workerFn.bind(this, payload, logger))
    .then(this.respondSuccess.bind(this, message))
    .catch(this.handleError.bind(this, message));
};

/**
 * Handles an error.
 * By default nacks the sourceMessage and does not throw the error.
 * Should be implemented by actual workers.
 * 
 * @param  {Object} sourceMessage
 * @param  {Error} err
 */
HWorkerServer.prototype.handleError = function (sourceMessage, err) {
  this.respondError(sourceMessage, err);
};

/**
 * Assign messaging methods to the HWorkerServer's prototype
 */
Object.assign(HWorkerServer.prototype, require('./messaging'));

module.exports = HWorkerServer;
