const should = require('should');
const Bluebird = require('bluebird');

const HWorkerClient = require('../../client');
const HWorkerServer = require('../../server');

const aux = require('../aux');

describe('client', function () {

  beforeEach(function () {
    return aux.setup();
  });

  afterEach(function () {
    return aux.teardown();
  });

  it('should work', function (done) {

    this.timeout(10000);

    var client = new HWorkerClient({
      rabbitMQURI: aux.rabbitMQURI,
      taskName: 'test-task',
    });

    var server = new HWorkerServer({
      rabbitMQURI: aux.rabbitMQURI,
      taskName: 'test-task',
    }, function () {

      console.log('dooo');

    });

    client.on('worker-update', (message) => {

      console.log(message)

      done();
    });

    return Bluebird.all([
      client.connect(),
      server.connect(),
    ])
    .then(() => {

      aux.registerQueueTeardown(client.taskQueueName);
      aux.registerQueueTeardown(client.resultsQueueName);

      aux.registerExchangeTeardown(client.taskExchangeName);

      return client.scheduleRequest({
        some: 'data',
      });
    })
    .then(() => {
      return aux.wait(8000);
    })
    .then(() => {


      console.log('ok');
    });
  });
});