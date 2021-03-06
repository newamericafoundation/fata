/**
 * Drone page handler.
 */
var app = module.parent.exports.app;

app.get('/drone/:agency/drones.geojson', function(req, res) {
    var async = require('async'),
        dataHandler = req.dataHandler,
        drones,
        parallel = [];

    // Load drone_aggregate info
    parallel.push(function(callback) {
        dataHandler.find({collection: 'drones', conditions: {agency: req.params.id}}, function(data) {
            drones = data,
            callback(null);
        });
    });

    function drone_geojson(d) {
        return {
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [d.Longitude, d.Latitude]
            },
            'properties': {
                'date': d.Date,
                'description': (d.deaths_min == d.deaths_max) ? 
                    "" + d.deaths_max + " deaths - " +  d.Date :
                    "" + d.deaths_min + "-" + d.deaths_max + " deaths - " +  d.Date,
                'year': d.Year,
                'deaths_min': d.deaths_min,
                'assumed_target': d['Assumed Target'],
                'location': d.Location
            }
        };
    }

    // Run all tasks and render.
    async.parallel(parallel, function(error) {
        // Close the DB connection.
        dataHandler.close();

        res.send({
            'type': 'FeatureCollection',
            'features': _(drones).map(drone_geojson)
        });
    });

});
