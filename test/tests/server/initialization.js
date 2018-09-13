const assert = require('assert');
const should = require('should');

const HWorkerClient = require('../../../client');
const HWorkerServer = require('../../../server');

const aux = require('../../aux');

describe('HWorkerServer initialization', function () {

  beforeEach(function () {
    return aux.setup();
  });

  afterEach(function () {
    return aux.teardown();
  });

  var BASE_OPTIONS = {
    name: 'test-task',
  };

  it('should require options to be passed as the first argument', function () {
    assert.throws(function () {
      var worker = new HWorkerServer(undefined, function () {});
    }, HWorkerServer.errors.InvalidOption);
  });

  it('should require a name option to be passed in the options object', function () {
    var opts = Object.assign({}, BASE_OPTIONS);

    delete opts.name;

    assert.throws(function () {

      var worker = new HWorkerServer(opts, function () {});

    }, HWorkerServer.errors.InvalidOption);
  });


  it('should require a workerFn to be defined as the second argument', function () {

    var opts = Object.assign({}, BASE_OPTIONS);

    assert.throws(function () {
      var worker = new HWorkerServer(opts, undefined);
    }, HWorkerServer.errors.InvalidOption);
  });
});