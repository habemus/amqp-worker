const should = require('should');
const Bluebird = require('bluebird');

const HWorkerClient = require('../../../client');
const HWorkerServer = require('../../../server');

const aux = require('../../aux');

describe('HWorkerServer', function () {

  beforeEach(function () {
    return aux.setup();
  });

  afterEach(function () {
    return aux.teardown();
  });

  describe('job execution', function () {

    it('should execute the job defined upon receiving a message', function (done) {

      this.timeout(10000);

      var REQUEST_ID = false;

      var client = new HWorkerClient({
        rabbitMQURI: aux.rabbitMQURI,
        taskName: 'test-task',
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
        rabbitMQURI: aux.rabbitMQURI,
        taskName: 'test-task',
      }, testTaskFn);

      client.on('workload-error', (requestId, errorData) => {
        done(errorData);
      });

      client.on('workload-result', (requestId, result) => {
        result.should.eql({
          someKey: 'someValue-after-work'
        });

        requestId.should.eql(REQUEST_ID);

        done();
      });

      Bluebird.all([
        client.connect(),
        server.connect(),
      ])
      .then(() => {

        aux.registerQueueTeardown(client.taskQueueName);
        aux.registerQueueTeardown(client.updatesQueueName);

        aux.registerExchangeTeardown(client.taskExchangeName);

        return client.scheduleRequest({
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
      var INFO_LOG_DONE = 0;
      var WARNING_LOG_DONE = 0;

      var client = new HWorkerClient({
        rabbitMQURI: aux.rabbitMQURI,
        taskName: 'test-task',
      });

      client.on('workload-info', function (requestId, data) {

        requestId.should.eql(REQUEST_ID);
        data.should.eql(['test']);

        INFO_LOG_DONE += 1;
      });

      client.on('workload-result', function (requestId, data) {

        INFO_LOG_DONE.should.eql(1);

        done();
      })


      /**
       * Fake task function
       */
      function testTaskFn(data, logger) {
        return aux.wait(1000)
          .then(() => {

            logger.info('test');

            return {
              someKey: data.someKey + '-after-work'
            };
          });
      }

      var server = new HWorkerServer({
        rabbitMQURI: aux.rabbitMQURI,
        taskName: 'test-task',
      }, testTaskFn);

      Bluebird.all([
        client.connect(),
        server.connect(),
      ])
      .then(() => {

        aux.registerQueueTeardown(client.taskQueueName);
        aux.registerQueueTeardown(client.updatesQueueName);
        aux.registerExchangeTeardown(client.taskExchangeName);

        return client.scheduleRequest({
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