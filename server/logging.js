/**
 * Publishses a 'info' level log
 * @param  {Object} sourceMessage
 */
exports.log = exports.info = function (sourceMessage) {

  var type = 'log:info';
  var args = _array(arguments);

  var message = {
    type: type,
    data: args.slice(1),
  };

  this.publishResult(sourceMessage, message, {
    type: type
  });
};

/**
 * Publishses a 'warning' level log
 * @param  {Object} sourceMessage
 */
exports.warn = function (sourceMessage) {

  var type = 'log:warning';
  var args = _array(arguments);

  var message = {
    type: type,
    data: args.slice(1),
  };

  this.publishResult(sourceMessage, message, {
    type: type
  });
};

/**
 * Publishses a 'error' level log
 * @param  {Object} sourceMessage
 */
exports.error = function (sourceMessage) {

  var type = 'log:error';
  var args = _array(arguments);

  var message = {
    type: type,
    data: args.slice(1),
  };

  this.publishResult(sourceMessage, message, {
    type: type
  });
};
