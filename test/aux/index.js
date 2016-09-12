// third-party
const Bluebird = require('bluebird');
const amqplib  = require('amqplib');

const RABBIT_MQ_URI = 'amqp://192.168.99.100';

exports.rabbitMQURI = RABBIT_MQ_URI;

exports.wait = function (ms) {
  return new Bluebird((resolve, reject) => {
    setTimeout(resolve, ms);
  });
};


var QUEUES    = [];
var EXCHANGES = [];

exports.registerQueueTeardown = function (queueName) {
  if (QUEUES.indexOf(queueName) === -1) {
    QUEUES.push(queueName);
  }
};

exports.registerExchangeTeardown = function (exchangeName) {
  if (EXCHANGES.indexOf(exchangeName) === -1) {
    EXCHANGES.push(exchangeName);
  }
};

exports.setup = function () {

  var _assets = {};

  return Bluebird.resolve(amqplib.connect(RABBIT_MQ_URI))
    .then((connection) => {
      _assets.rabbitMQConnection = connection;

      return connection.createChannel();
    })
    .then((channel) => {
      _assets.rabbitMQChannel = channel;

      return _assets;
    });
};

exports.teardown = function () {

  return Bluebird.resolve(amqplib.connect(RABBIT_MQ_URI))
    .then((connection) => {
      return connection.createChannel();
    })
    .then((channel) => {

      var deleteQueuesPromises = QUEUES.map((queueName) => {
        console.log('delelte queue', queueName);
        return channel.deleteQueue(queueName);
      });

      var deleteExchangesPromises = EXCHANGES.map((exchangeName) => {
        console.log('delelte exchange', exchangeName);
        return channel.deleteExchange(exchangeName);
      });

      return Bluebird.all(deleteQueuesPromises.concat(deleteExchangesPromises));
    });
};
