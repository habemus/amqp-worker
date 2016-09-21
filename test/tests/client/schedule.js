const assert = require('assert');
const should = require('should');
const Bluebird = require('bluebird');

const HWorkerClient = require('../../../client');

const aux = require('../../aux');

describe('HWorkerClient#schedule', function () {

  beforeEach(function () {
    return aux.setup();
  });

  afterEach(function () {
    return aux.teardown();
  });

  var BASE_OPTIONS = {
    rabbitMQURI: aux.rabbitMQURI,
    name: 'test-task',
  };

  it('should the client to be connected before scheduling', function () {

    var client = new HWorkerClient({
      rabbitMQURI: aux.rabbitMQURI,
      name: 'test-task',
    });

    assert.throws(function () {

      client.schedule();

    }, HWorkerClient.errors.NotConnected);
  });
});