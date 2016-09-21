const should = require('should');
const Bluebird = require('bluebird');

const amqplib = require('amqplib');

const HWorkerClient = require('../../../client');
const HWorkerServer = require('../../../server');

const aux = require('../../aux');

describe('HWorkerServer workload', function () {

  beforeEach(function () {
    return aux.setup();
  });

  afterEach(function () {
    return aux.teardown();
  });

  describe('execution', function () {

    it('should execute the workload defined upon receiving a message', function (done) {

      this.timeout(10000);

      var REQUEST_ID = false;

      var client = new HWorkerClient({
        name: 'test-task',
      });

      /**
       * Fake task function
       */
      function testTaskFn(data) {
        return aux.wait(1000)
          .then(() => {
            return {
              someKey: data.someKey + '-after-work'
            };
          });
      }

      var server = new HWorkerServer({
        name: 'test-task',
      }, testTaskFn);

      client.on('result:error', (requestId, errorData) => {
        done(errorData);
      });

      client.on('result:success', (requestId, result) => {
        result.should.eql({
          someKey: 'someValue-after-work'
        });

        requestId.should.eql(REQUEST_ID);

        done();
      });

      Bluebird.all([
        client.connect(aux.rabbitMQURI),
        server.connect(aux.rabbitMQURI),
      ])
      .then(() => {

        // TEARDOWN
        aux.registerQueueTeardown(client.workerQueueName);
        aux.registerQueueTeardown(client.replyTo);

        aux.registerExchangeTeardown(client.workerExchangeName);

        aux.registerConnectionTeardown(client.connection);
        aux.registerConnectionTeardown(server.connection);

        return client.schedule({
          someKey: 'someValue',
        });
      })
      .then((requestId) => {
        // store the request's id
        REQUEST_ID = requestId;
      });
    });

    it('should require the incoming message to have properties.contentType === application/json', function (done) {

      var ERROR_PUBLISHED = false;

      var server = new HWorkerServer({
        name: 'test-task',
      }, function () {});

      // mock server's channel property
      server.channel = {
        nack: function (message, allUpTo, requeue) {
          allUpTo.should.eql(false);
          requeue.should.eql(false);

          // the error should have been published before
          // the nack
          ERROR_PUBLISHED.should.eql(true);

          done();
        },
        publish: function (exchange, routingKey, content, options) {

          options.type.should.eql('result:error');

          content = JSON.parse(content.toString());
          content.name.should.eql('UnsupportedContentType');

          ERROR_PUBLISHED = true;
        },
      };

      // make a fake message
      server.handleMessage({
        properties: {
          contentType: 'application/not-json',
          replyTo: 'another-application-id-queue'
        },
        data: '1234567890',
      });
    });

    it('should error if the json is not well formatted', function (done) {

      var ERROR_PUBLISHED = false;

      var server = new HWorkerServer({
        name: 'test-task',
      }, function () {});

      // mock server's channel property
      server.channel = {
        nack: function (message, allUpTo, requeue) {
          allUpTo.should.eql(false);
          requeue.should.eql(false);

          // the error should have been published before
          // the nack
          ERROR_PUBLISHED.should.eql(true);

          done();
        },
        publish: function (exchange, routingKey, content, options) {

          options.type.should.eql('result:error');

          content = JSON.parse(content.toString());

          content.name.should.eql('MalformedMessage');

          ERROR_PUBLISHED = true;
        },
      };

      // make a fake message
      server.handleMessage({
        properties: {
          contentType: 'application/json',
          replyTo: 'another-application-id-queue'
        },
        data: 'not good json',
      });
    });

    it('should result in error in case the workerFn throws an exception or rejects', function (done) {

      this.timeout(10000);

      var REQUEST_ID = false;

      var client = new HWorkerClient({
        name: 'test-task',
      });

      /**
       * Fake task function
       */
      function testTaskFn(data) {
        throw new Error('error!!!');
      }

      var server = new HWorkerServer({
        name: 'test-task',
      }, testTaskFn);

      client.on('result:error', (requestId, errorData) => {
        requestId.should.eql(REQUEST_ID);

        errorData.message.should.eql('error!!!');

        done();
      });

      client.on('result:success', (requestId, result) => {

        done(new Error('error expected'));
      });

      Bluebird.all([
        client.connect(aux.rabbitMQURI),
        server.connect(aux.rabbitMQURI),
      ])
      .then(() => {

        // TEARDOWN
        aux.registerQueueTeardown(client.workerQueueName);
        aux.registerQueueTeardown(client.replyTo);

        aux.registerExchangeTeardown(client.workerExchangeName);

        aux.registerConnectionTeardown(client.connection);
        aux.registerConnectionTeardown(server.connection);

        return client.schedule({
          someKey: 'someValue',
        });
      })
      .then((requestId) => {
        // store the request's id
        REQUEST_ID = requestId;
      });
    });

  });

  describe('logging', function () {
    it('should allow the server to send info logs to the client regarding the job', function (done) {
      this.timeout(10000);

      var REQUEST_ID = false;
      var LOG_INFO_COUNT = 0;
      var LOG_WARNING_COUNT = 0;
      var LOG_ERROR_COUNT = 0;

      var client = new HWorkerClient({
        name: 'test-task',
      });

      /**
       * Register info logs
       */
      client.on('log:info', function (requestId, data) {

        requestId.should.eql(REQUEST_ID);
        data.should.eql(['test-1', 'test-2', {
          info: 'data'
        }]);

        LOG_INFO_COUNT += 1;
      });

      /**
       * Register warning logs
       */
      client.on('log:warning', function (requestId, data) {
        requestId.should.eql(REQUEST_ID);
        data.should.eql(['warn-test-1', { warn: 'data' }]);

        LOG_WARNING_COUNT += 1;
      });

      /**
       * Register error logs
       */
      client.on('log:error', function (requestId, data) {
        requestId.should.eql(REQUEST_ID);

        data.should.eql(['error-test-1', { error: 'data' }]);

        LOG_ERROR_COUNT += 1;
      });

      client.on('result:error', function (requestId, data) {
        done(data);
      });

      /**
       * Upon result arrival, check if all logs were correctly registered
       * and finish test
       */
      client.on('result:success', function (requestId, data) {

        LOG_INFO_COUNT.should.eql(2);
        LOG_WARNING_COUNT.should.eql(1);
        LOG_ERROR_COUNT.should.eql(1);

        done();
      });

      /**
       * Fake task function
       */
      function testTaskFn(data, logger) {

        logger.info('test-1', 'test-2', {
          info: 'data'
        });

        return aux.wait(300)
          .then(() => {

            logger.warn('warn-test-1', {
              warn: 'data'
            });

            logger.log('test-1', 'test-2', {
              info: 'data'
            });

            return aux.wait(300);
          })
          .then(() => {

            logger.error('error-test-1', {
              error: 'data'
            });

            return {
              someKey: data.someKey + '-after-work'
            };
          });
      }

      var server = new HWorkerServer({
        name: 'test-task',
      }, testTaskFn);

      Bluebird.all([
        client.connect(aux.rabbitMQURI),
        server.connect(aux.rabbitMQURI),
      ])
      .then(() => {

        // TEARDOWN
        aux.registerQueueTeardown(client.workerQueueName);
        aux.registerQueueTeardown(client.replyTo);

        aux.registerExchangeTeardown(client.workerExchangeName);

        aux.registerConnectionTeardown(client.connection);
        aux.registerConnectionTeardown(server.connection);

        return client.schedule({
          someKey: 'someValue',
        });
      })
      .then((requestId) => {
        // store the requestId
        REQUEST_ID = requestId;
      });
    });
  });
});