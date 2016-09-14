// native
const util = require('util');

/**
 * Base error constructor
 * @param {String} message
 */
function HWorkerError(message) {
  Error.call(this);
  
  this.message = message;
};
util.inherits(HWorkerError, Error);
HWorkerError.prototype.name = 'HWorkerError';

/**
 * Happens when any required option is invalid
 *
 * error.option should have the option that is invalid
 * error.kind should contain details on the error type
 * 
 * @param {String} option
 * @param {String} kind
 * @param {String} message
 */
function InvalidOption(option, kind, message) {
  HWorkerError.call(this, message);

  this.option = option;
  this.kind = kind;
}
util.inherits(InvalidOption, HWorkerError);
InvalidOption.prototype.name = 'InvalidOption';
InvalidOption.prototype.toJSON = function () {
  return {
    name: this.name,
    option: this.option,
    kind: this.kind,
    message: this.message,
  }
};

/**
 * Happens when the server or the client receives a malformed message
 * @param {String} message
 */
function MalformedMessage(message) {
  HWorkerError.call(this, message);
}
util.inherits(MalformedMessage, HWorkerError);
MalformedMessage.prototype.name = 'MalformedMessage';
MalformedMessage.prototype.toJSON = function () {
  return {
    name: this.name,
    message: this.message,
  };
};

/**
 * Happens when the contentType of the message's properties is 
 * not supported by either client or server
 * @param {String} message
 */
function UnsupportedContentType(message) {
  HWorkerError.call(this, message);
}
util.inherits(UnsupportedContentType, HWorkerError);
UnsupportedContentType.prototype.name = 'UnsupportedContentType';
UnsupportedContentType.prototype.toJSON = function () {
  return {
    name: this.name,
    message: this.message,
  };
};

/**
 * Happens when either the server or client
 * are not connected to the rabbitMQ instance
 * @param {String} message
 */
function NotConnected(message) {
  HWorkerError.call(this, message);
}
util.inherits(NotConnected, HWorkerError);
NotConnected.prototype.name = 'NotConnected';

exports.HWorkerError = HWorkerError;
exports.InvalidOption = InvalidOption;
exports.MalformedMessage = MalformedMessage;
exports.UnsupportedContentType = UnsupportedContentType;
exports.NotConnected = NotConnected;
