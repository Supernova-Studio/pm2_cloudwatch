const pmx = require("pmx");
const pm2 = require("pm2");

var conf = pmx.initModule({}, function (err, conf) {
    var destinations = [];
    console.log("CONF=", conf)
    process.on("uncaughtException", function (err) {
        console.log(err);
    });

    if (!conf.poll_interval == null && conf.poll_interval != 0) {
        conf.poll_interval = 10 * 1000;
    }

    destinations.push(require("./destinations/console-destination")());

    if (conf.cloudwatch_enabled) {
        var CloudWatch = require("./destinations/cloudwatch-destination");
        destinations.push(
            new CloudWatch(
                conf.aws_region,
                conf.aws_access_key,
                conf.aws_secret_key,
                conf.cloudwatch_namespace,
                conf.cloudwatch_restart_metric
            )
        );
    }

    var pidStats = {};

    const pollPm2 = function () {
        pm2.list(function (err, processDescriptionList) {
            if (err) {
                console.log("Error getting process list from pm2: " + err);
            } else {
                var now = new Date();
                processDescriptionList.forEach(function (p) {
                    var pm2Id = p.pm2_env.pm_id;
                    if (p.name === "supernova_pm2_cloudwatch" || p.name === "pm2_cloudwatch") return; //exclude self

                    if (!pidStats[pm2Id]) {
                        try {
                            pidStats[pm2Id] = {
                                name: p.name,
                                pid: p.pid,
                                pm2Id: pm2Id,
                                last_update: now,
                                status: p.pm2_env.status,
                                restart_time: p.pm2_env.restart_time || 0,
                                pm_uptime: p.pm2_env.pm_uptime,
                                pm_out_log_path: p.pm2_env.pm_out_log_path,
                                pm_err_log_path: p.pm2_env.pm_err_log_path,
                            };
                        } catch (err) {
                            console.error(err);
                        }
                    } else {
                        pidStats[pm2Id].last_update = now;
                        if (pidStats[pm2Id].restart_time != p.pm2_env.restart_time) {
                            console.log(
                                "Restart detected on " +
                                    pm2Id +
                                    ", was:" +
                                    pidStats[pm2Id].restart_time +
                                    ", now:" +
                                    p.pm2_env.restart_time
                            );
                            pidStats[pm2Id].restart_time = p.pm2_env.restart_time;
                            alertRestarts(pidStats[pm2Id]);
                        }
                    }
                });
            }
            setTimeout(function () {
                pollPm2();
            }, conf.pollInterval);
        });
    };

    function alertRestarts(processData) {
        destinations.forEach(function (destination) {
            try {
                if (destination.isDisabled) {
                    return;
                }
                destination.notifyRestart(processData);
            } catch (e) {
                console.error("Destination crashed and will now be disabled: " + e);
                destination.isDisabled = true;
            }
        });
    }

    pm2.connect(function (err) {
        if (err) {
            console.log("Error connecting to pm2: " + err);
        } else {
            pollPm2();
        }
    });
});
