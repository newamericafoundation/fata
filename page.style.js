/**
 * TileLite MML handler.
 */
var app = module.parent.exports;

app.get('/style/:question', function(req, res) {
    var async = require('async'),
        style = require('./style'),
        dataHandler = req.dataHandler,
        waterfall = [],
        parallel = [],
        view = [],
        supportFields = ['Somewhat Support', 'Strongly Support'],
        color_start = style.Color('000000'),
        color_end = style.Color('111111');
        question = req.params.question;
    waterfall.push(function(callback) {
        // Load list of agencies
        dataHandler.find({collection: 'agencies'}, function(agencies) {
            callback(null, agencies);
        });
    });
    waterfall.push(function(agencies, callback) {
        // Load question responses for each agency
        agencies.forEach(function(agency) {
            parallel.push(function (callback) {
                dataHandler.countField({collection: 'responses', field: question, conditions: {Agency:agency.ID}}, function(result) {
                    var totalResponses = _.reduce(result, function(memo, num){
                        return memo + num.value.count;
                    }, 0);
                    var support = 0;
                    supportFields.forEach(function(field) {
                        result.forEach(function(row) {
                            if (row._id == field && row.value.count) {
                                support += row.value.count;
                            }
                        });
                    });
                    view.push({
                        agency: agency.ID,
                        percent: support / totalResponses * 100
                    });
                    callback(null);
                });
            });
        });
        async.parallel(parallel, function(err) {
            var list_normalize = function(a, list) {
                return (a - _.min(list)) / (_.max(list) - _.min(list));
            }
            res.render('style', {
                layout: false,
                locals: {
                    rules: _.map(view, function(record) {
                            return {
                                selector: '#data[ID = "' + record.agency + '"]',
                                properties: [
                                    {
                                        property: 'polygon-fill',
                                        value: color_start.blend(color_end,
                                            list_normalize(record.percent,
                                            _.pluck(view, 'percent')))
                                    }
                                ]
                            }
                        })
                    ,
                    layers: [
                        {
                            property: 'polygon-fill',
                            value: '#000',
                            file: 'test.shp',
                            type: 'shape',
                            id: 'data',
                        }
                    ]
                }
            });
        });
    });
    async.waterfall(waterfall);
});