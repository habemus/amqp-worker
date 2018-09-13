// native
const EventEmitter = require('events').EventEmitter;
const util = require('util');

// third-party
const amqplib  = require('amqplib');
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

  options = options || {};

  /**
   * The function that defines the workload.
   * Should return a promise if it is asynchrnous.
   *
   * Receives the rabbitMQ's message payload as the first argument
   * and a 'logger' object as the second argument.
   * 
   * @type {Function}
   */
  this.workerFn = workerFn || this.workerFn;

  if (typeof this.workerFn !== 'function') {
    throw new errors.InvalidOption('workerFn', 'required');
  }

  /**
   * Name of the worker.
   * Used to generate queue and exchange names.
   * 
   * @type {String}
   */
  this.name = options.name || this.name;

  if (!this.name) {
    throw new errors.InvalidOption('name', 'required');
  }

  this.workerExchangeName = this.name + '-exchange';
  this.workerQueueName    = this.name;

  this.appId = options.appId || uuid.v4();

  // bind methods to the instance
  this.handleMessage = this.handleMessage.bind(this);
  this.handleError   = this.handleError.bind(this);

  this.logInfo = this.logInfo.bind(this);
  this.logWarning = this.logWarning.bind(this);
  this.logError = this.logError.bind(this);

  this.prefetch = options.prefetch || this.prefetch;
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
 * Quantity of messages to be pre fetched.
 *
 * http://www.squaremobius.net/amqp.node/channel_api.html#channel_prefetch
 *
 * @default 1
 * @type {Number}
 */
HWorkerServer.prototype.prefetch = 1;

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
 * @return {Promise -> HWorkerServer}
 */
HWorkerServer.prototype.connect = function (connectionOrURI) {

  if (!connectionOrURI) {
    return Promise.reject(new errors.InvalidOption('connectionOrURI', 'required'));
  }

  var workerQueueName    = this.workerQueueName;
  var workerExchangeName = this.workerExchangeName;

  var _channel;

  var connectionPromise = (typeof connectionOrURI === 'string') ?
    Promise.resolve(amqplib.connect(connectionOrURI)) :
    Promise.resolve(connectionOrURI);

  return connectionPromise.then((connection) => {
    this.connection = connection;
    
    return connection.createChannel();
  })
  .then((channel) => {
    _channel = channel;

    return _channel.prefetch(this.prefetch, true);

  })
  .then(() => {
    return Promise.all([
      /**
       * Queue at which task execution requests will be stored.
       */
      _channel.assertQueue(workerQueueName),
      /**
       * Exchange for both queues.
       */
      _channel.assertExchange(workerExchangeName, 'direct'),
      /**
       * Bind the workerQueue to the exchange using
       * the workerQueueName itself as the routingKey
       */
      _channel.bindQueue(workerQueueName, workerExchangeName, workerQueueName),
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

    this.channel.consume(this.workerQueueName, this.handleMessage, {
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
 * @return {Promise}
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
   * Wrap it with a Promise, as to ensure
   * its value is promise-chainable even if
   * the function itself does not return a promise.
   */
  return new Promise((resolve, reject) => {
    try {
      resolve(this.workerFn(payload, logger))
    } catch (err) {
      reject(err)
    }
  })
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
