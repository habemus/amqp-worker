// third-party
const amqplib = require('amqplib');

const RABBIT_MQ_URI = 'amqp://localhost';

exports.rabbitMQURI = RABBIT_MQ_URI;

exports.wait = function (ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
};

var QUEUES    = [];
var EXCHANGES = [];
var CONNECTIONS = [];

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

exports.registerConnectionTeardown = function (connection) {
  if (CONNECTIONS.indexOf(connection) === -1) {
    CONNECTIONS.push(connection);
  }
}

exports.setup = function () {

  var _assets = {};

  return Promise.resolve(amqplib.connect(RABBIT_MQ_URI))
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

  var _connection;

  return Promise.resolve(amqplib.connect(RABBIT_MQ_URI))
    .then((connection) => {
      _connection = connection;
      return connection.createChannel();
    })
    .then((channel) => {

      var deleteQueuesPromises = QUEUES.map((queueName) => {
        // console.log('delete queue', queueName);
        return channel.deleteQueue(queueName);
      });

      var deleteExchangesPromises = EXCHANGES.map((exchangeName) => {
        // console.log('delete exchange', exchangeName);
        return channel.deleteExchange(exchangeName);
      });

      var closeConnectionsPromises = CONNECTIONS.map((connection) => {
        return connection.close();
      });

      return Promise.all(
        deleteQueuesPromises
          .concat(deleteExchangesPromises)
          .concat(closeConnectionsPromises)
      );
    })
    .then(() => {
      return _connection.close();
    })
    .catch((err) => {
      // console.warn(err);
      // throw err;
    });
};
