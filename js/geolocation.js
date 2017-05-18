var endpoint = "https://maps.googleapis.com/maps/api/geocode/json?address="

install.patch(function() {
  return {
    address: async function(address) {
      address = address.replace(/\s/g, '+');
      var bounds = "&bounds=47.4955511,-122.4359085|47.734145,-122.2359032";
      var data = await fetch(endpoint + address + bounds).then(r => r.json());

      if (data.status == "ZERO_RESULTS") {
        // invalid entry
        throw "No results";
      } else if (data.results[0].formatted_address.indexOf("Seattle") < 0) {
        // not in seattle
        throw "Not in Seattle";
      } else {
        var lat = data.results[0].geometry.location.lat;
        var lng = data.results[0].geometry.location.lng;

        return [lat, lng];
      }
    },
    gps: async function(callback) {
      return new Promise(function(ok, fail) {
        navigator.geolocation.getCurrentPosition(function(gps) {
          ok([gps.coords.latitude, gps.coords.longitude]);
        }, fail);
      });
    }
  };
});