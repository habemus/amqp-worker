const assert = require('assert');
const should = require('should');
const Bluebird = require('bluebird');

const HWorkerClient = require('../../../client');

const aux = require('../../aux');

describe('HWorkerClient#scheduleWorkloadRequest', function () {

  beforeEach(function () {
    return aux.setup();
  });

  afterEach(function () {
    return aux.teardown();
  });

  var BASE_OPTIONS = {
    rabbitMQURI: aux.rabbitMQURI,
    taskName: 'test-task',
  };

  it('should the client to be connected before scheduling', function () {

    var client = new HWorkerClient({
      rabbitMQURI: aux.rabbitMQURI,
      taskName: 'test-task',
    });

    assert.throws(function () {

      client.scheduleWorkloadRequest();

    }, HWorkerClient.errors.NotConnected);
  });
});