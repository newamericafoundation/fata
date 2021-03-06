/**
 * Wrapper class to simplify querying for data from mongodb.
 *
 * Assumptions: should be associated with the request object (not the app) and
 * allows for only one connection per instance. (See this.connect() method).
 */
var DataHandler = module.exports = function DataHandler(db) {
    this.db = db;
};

/**
 * Asynchronous. Ensure that the database has a connection and avoid creating
 * additional connections if this DataHandler instance is already connected.
 */
DataHandler.prototype.connect = function(callback) {
    if (this.db.state === 'connected') {
        callback(null);
    }
    else {
        this.db.open(function(err) { callback(err); });
    }
};

/**
 * Asynchronous. Close the database connection.
 */
DataHandler.prototype.close = function() {
    this.db.close();
};

/**
 * Asynchronous. Perform a mongodb find query against a collection.
 *
 * @param {Object} params
 *   Find parameters:
 *   - collection {String}
 *     The mongodb collection to use. Example: 'responses'.
 *   - conditions {Object}
 *     Query conditions. Use {} to return all documents.
 *     Example: { name: 'foobar' } // Find documents where name = 'foobar'.
 *   - fields {Object}
 *     Fields to return for each document.
 * @param {Function} callback
 *   Callback function to use once query is complete.
 */
DataHandler.prototype.find = function(params, callback) {
    var db = this.db,
        self = this;
    params.collection = params.collection || '';
    params.conditions = params.conditions || {};
    params.fields = params.fields || {};

    self.connect(function(err) {
        db.collection(params.collection, function(err, collection) {
            if (err)
                throw err
            var data = [];
            collection.find(params.conditions, params.fields, function(err, cursor) {
                cursor.each(function(err, record) {
                    if (record != null) {
                        data.push(record);
                    }
                    else {
                        callback(data);
                    }
                });
            });
        });
    });
};

/**
 * Asynchronous. Perform a mongodb mapreduce that groups and counts distinct
 * values for a given field. The mapreduce operation generates a permanent
 * resultset collection using a collection id:
 *
 * - count_[collection] // no conditions
 * - count_[collection]_[field_a]_[value_a] // where field_a: value_a is a condition
 *
 * Each mapreduce collection will contain documents with _id's matching the
 * field names of documents in the source collection.
 *
 * @param {Object} params
 *   Find parameters:
 *   - collection {String}
 *     The mongodb collection to use. Example: 'responses'.
 *   - field {Object}
 *     Field whose values should be grouped and counted.
 *   - conditions {Object}
 *     Query conditions. Use {} to return all documents.
 *     Example: { name: 'foobar' } // Find documents where name = 'foobar'.
 * @param {Function} callback
 *   Callback function to use once query is complete.
 */
DataHandler.prototype.countField = function(params, callback) {
    var self = this,
        db = this.db,
        data = [],
        fieldConditions = {};
    params.collection = params.collection || '';
    params.conditions = params.conditions || {};
    params.field = params.field || '';

    // Build the collection id.
    var cid = 'count_' + params.collection;
    if (params.conditions) {
        cid += '_'+ this.sanitize(params.conditions);
    }

    // Field find() condition. If params.field is a list of fields, build the
    // conditions accordingly (using mongodb '$in').
    if (typeof params.field === 'object') {
        fieldConditions._id = {'$in': params.field};
    }
    else {
        fieldConditions._id = params.field;
    }

    // Query the collection id. If it has no documents, build the mapreduce
    // collection before querying again.
    // @TODO: Is there a better method to tell whether a collection has been
    // instantiated without querying it directly?
    self.find({collection: cid, conditions: fieldConditions}, function(data) {
        // mixreduce collection has items. Use it.
        if (data.length > 0) {
            callback(data);
            return;
        }
        // If the mixreduce collection has no items, run a test query to ensure
        // that there are items to mixreduce to begin with.
        self.find({collection: params.collection, conditions: params.conditions}, function(data) {
            if (data.length === 0) {
                callback([]);
                return;
            }
            self.connect(function(err) {
                db.collection(params.collection, function(err, collection) {
                    // Map function.
                    // For a single document like:
                    // - { Q1a: 'Favorable', Q1b: 'Unfavorable', Q1c: 'Unsatisfied' }
                    // Emits the following documents:
                    // - { key: Q1a, val: { Favorable: 1 }}
                    // - { key: Q1b, val: { Unfavorable: 1 }}
                    // - { key: Q1c, val: { Unsatisfied: 1 }}
                    var map = function() {
                        for (var field in this) {
                            var val = {};
                            val[this[field]] = 1;
                            emit(field, val);
                        }
                    };
                    // Reduce function.
                    // Collects items with the same key and creates counts of
                    // distinct values from the source document.
                    // Based on the map function examples above, a typical run
                    // will look like:
                    // - k: 'Q1a'
                    // - val: [{ Favorable: 1}, { Unfavorable: 1}, { Favorable: 1}]
                    // Where each element in val is provided by a distinct row
                    // in the source collection. The reduce function collates
                    // and counts each of these instances and returns a single
                    // reduced document:
                    // { _id: 'Q1a', value: {Favorable: 2, Unfavorable: 1} }
                    var reduce = function(k, val) {
                        var doc = {};
                        for (var i = 0; i < val.length; i++) {
                            for (var j in val[i]) {
                                doc[j] = doc[j] || 0;
                                doc[j] += val[i][j];
                            }
                        }
                        return doc;
                    };
                    collection.mapReduce( map, reduce, { query: params.conditions, out: cid }, function(err, collection) {
                        self.find({collection: cid, conditions: fieldConditions}, callback);
                    });
                });
            });
        });
    });
};

/**
 * Asynchronous. Read a file and process its contents using markdown.
 *
 * @param {Object} params
 *   Parameters:
 *   - path {String}
 *     Path to the file to be read. Example: 'content/foo.md'
 * @param {Function} callback
 *   Callback function to use once reading and markdown conversion is complete.
 */
DataHandler.prototype.markdown = function(params, callback) {
    var markdown = require('markdown'),
        fs = require('fs');
    params.path = params.path || '';

    fs.readFile(params.path, 'utf-8', function(err, data) {
        data = data || '';
        callback(markdown.Markdown(data));
    });
};

/**
 * @param {Object} params
 *   Parameters:
 *   - group {Object}
 *   - context {String}
 *   - conditions {Object}
 *     Query conditions. Use {} to return all documents.
 *     Example: { name: 'foobar' } // Find documents where name = 'foobar'.
 * @param {Function} callback
 *   Callback function to use once query is complete.
 */
DataHandler.prototype.loadQuestion = function(params, callback) {
    var self = this,
        group = params.group,
        context = params.context,
        conditions = params.conditions;
    // Filter questions down to those that should be displayed in
    // this context.
    var display = [];
    for (var q in group.questions) {
        if (group.questions[q].display.indexOf(context) !== -1) {
            display.push(q);
        }
    }
    var series = [];
    series.push(function(callback) {
        self.countField({collection: 'responses', field: display, conditions: conditions}, function(result) {
            if (result.length === 0) {
                display.forEach(function(q) {
                    group.questions[q].responses = [];
                });
            }
            else {
                result.forEach(function(response) {
                    var responses = [];
                    var graph = require('graph');
                    group.questions[response._id].responses = responses;
                    graph.process({answers:group.answers}, response.value).forEach(function(bar) {
                        responses.push(bar);
                    });
                });
            }
            callback(null);
        });
    });

    async = require('async');
    async.series(series, function() {
        // Gross. Convert objects to arrays for templating.
        // @TODO: Should this be an optional params flag?
        var render = [];
        for (var i in group.questions) {
            if (group.questions[i].responses) {
                render.push(group.questions[i]);
            }
        }
        group.renderedQuestions = render;

        callback(group);
    });
};

/**
 * Synchronous. Convert an object to a mongodb-friendly collection name string.
 *
 * @param {Object} object
 *   The object to be converted to sanitized string.
 */
DataHandler.prototype.sanitize = function(object) {
    var sanitized = JSON.stringify(object);
    sanitized = sanitized.replace(/[\$\"\' ,\[\]\{\}:]/g, '').toLowerCase();
    return sanitized;
};
