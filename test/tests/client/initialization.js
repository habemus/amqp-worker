const assert = require('assert');
const should = require('should');
const Bluebird = require('bluebird');

const HWorkerClient = require('../../../client');

const aux = require('../../aux');

describe('HWorkerClient initialization', function () {

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

  it('should require options to be passed as the first argument', function () {
    assert.throws(function () {
      var client = new HWorkerClient(undefined);
    }, HWorkerClient.errors.InvalidOption);
  });

  it('should require rabbitMQURI option', function () {

    var opts = Object.assign({}, BASE_OPTIONS);

    delete opts.rabbitMQURI;

    assert.throws(function () {
      var client = new HWorkerClient(opts);
    }, HWorkerClient.errors.InvalidOption);

  });

  it('should require a taskName option to be passed in the options object', function () {
    var opts = Object.assign({}, BASE_OPTIONS);

    delete opts.taskName;

    assert.throws(function () {

      var client = new HWorkerClient(opts);

    }, HWorkerClient.errors.InvalidOption);
  });
});