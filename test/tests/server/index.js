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

      client.on('workload-error', (errorData) => {
        done(errorData);
      });

      client.on('workload-result', (result) => {
        result.should.eql({
          someKey: 'someValue-after-work'
        });

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
      });
    });
  });

});