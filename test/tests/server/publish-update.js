const assert = require('assert');
const should = require('should');
const Bluebird = require('bluebird');

const HWorkerClient = require('../../../client');
const HWorkerServer = require('../../../server');

const aux = require('../../aux');

describe('HWorkerServer#publishUpdate', function () {

  beforeEach(function () {
    return aux.setup();
  });

  afterEach(function () {
    return aux.teardown();
  });

  it('should automatically set contentType for String to `text/plain`', function (done) {

    var worker = new HWorkerServer({
      name: 'test-task',
    }, function () {});

    // mock channel
    worker.channel = {
      publish: function (exchange, routingKey, content, options) {

        content.should.be.instanceof(Buffer);
        content.toString().should.eql('text contents');

        options.contentType.should.eql('text/plain');

        done();
      }
    };

    // make fake sourceMessage
    worker.publishUpdate(
      {
        properties: {
          replyTo: 'fake-reply-to-queue',
        },
      },
      'text contents'
    );
  });

  it('should automatically set contentType for Objects to `application/json`', function (done) {
    var worker = new HWorkerServer({
      name: 'test-task',
    }, function () {});

    // mock channel
    worker.channel = {
      publish: function (exchange, routingKey, content, options) {

        content.should.be.instanceof(Buffer);
        content = JSON.parse(content.toString());

        content.some.should.eql('data');

        options.contentType.should.eql('application/json');

        done();
      }
    };

    // make fake sourceMessage
    worker.publishUpdate(
      {
        properties: {
          replyTo: 'fake-reply-to-queue',
        },
      },
      {
        some: 'data'
      }
    );
  });

  it('should treat everything else as string and, thus, `text/plain`', function (done) {
    var worker = new HWorkerServer({
      name: 'test-task',
    }, function () {});

    // mock channel
    worker.channel = {
      publish: function (exchange, routingKey, content, options) {

        content.should.be.instanceof(Buffer);

        content.toString().should.eql('true');

        options.contentType.should.eql('text/plain');

        done();
      }
    };

    // make fake sourceMessage
    worker.publishUpdate(
      {
        properties: {
          replyTo: 'fake-reply-to-queue',
        },
      },
      true
    );
  });

  it('should require a valid sourceMessage', function () {
    var worker = new HWorkerServer({
      name: 'test-task',
    }, function () {});

    // mock channel
    worker.channel = {
      publish: function (exchange, routingKey, content, options) {
        throw new Error('error expected');
      }
    };

    // must have replyTo
    assert.throws(function () {
      // make fake sourceMessage
      worker.publishUpdate(
        {
          properties: {
            replyTo: undefined,
          },
        },
        true
      );
    }, HWorkerServer.errors.InvalidOption);

    // must have properties
    assert.throws(function () {
      // make fake sourceMessage
      worker.publishUpdate(
        {
          properties: undefined
        },
        true
      );
    }, HWorkerServer.errors.InvalidOption);

  })
});