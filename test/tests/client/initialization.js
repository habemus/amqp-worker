const assert = require('assert');
const should = require('should');

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
    name: 'test-task',
  };

  it('should require options to be passed as the first argument', function () {
    assert.throws(function () {
      var client = new HWorkerClient(undefined);
    }, HWorkerClient.errors.InvalidOption);
  });

  it('should require a name option to be passed in the options object', function () {
    var opts = Object.assign({}, BASE_OPTIONS);

    delete opts.name;

    assert.throws(function () {

      var client = new HWorkerClient(opts);

    }, HWorkerClient.errors.InvalidOption);
  });
});