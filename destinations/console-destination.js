function ConsoleDestination() {
    this.notifyRestart = function (processData) {
        console.log(
            "** RESTART DETECTED ON " + processData.name + " (total " + processData.restart_time + " restarts)"
        );
    };
}

module.exports = function () {
    return new ConsoleDestination();
};
