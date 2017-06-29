(async function() {

  //required here
  var modules = install.batch("qsa", "geolocation", "util", "debounce", "resizer", "screenshot");
  var [$, geocoder, util, debounce, resizer, renderer] = await modules;

  // state is a grab-bag of settings, used instead of random globals
  var state = {
    features: {}
  };

  var frame = $.one(".map-frame");
  var mapElement = $.one(".map");

  var map = L.map(mapElement, {
    attributionControl: true,
    center: [47.5, -122],
    zoom: 10,
    detectRetina: true,
    minZoom: 1.5,
    maxZoom: 19,
    closePopupOnClick: false
  });

  var popupLayer = L.featureGroup();
  popupLayer.addTo(map);

  map.attributionControl.setPrefix("Mapzen, OpenStreetMap");

  var vectorLayer = Tangram.leafletLayer({ scene: "map-styles.yaml" });
  vectorLayer.addTo(map);
  var scene = vectorLayer.scene;

  //Hook up the download button to the pertinent map layers
  $.one(".download").addEventListener("click", () => renderer.downloadImage(map, scene, popupLayer));

  //call this to let the map know that its dimensions have changed
  var scheduleInvalidation = function() {
    setTimeout(() => map.invalidateSize());
  };

  // add presets here to set new possible display sizes
  var sizePresets = {
    video: [1920, 1080],
    large: [1200, 700],
    small: [640, 480],
    twitter: [800, 400]
  };

  var sizeSelect = $.one(".size-presets");

  var onPresetChoice = function() {
    var preset = sizePresets[sizeSelect.value];
    resizer.resize(...preset);
  };
  sizeSelect.addEventListener("change", onPresetChoice);

  //we also let the map know when the frame is resized
  frame.addEventListener("resize", debounce(function(e) {
    var custom = true;
    var { width, height } = e.detail;
    //check new size against presets, otherwise it's "custom"
    for (var [w, h] of Object.values(sizePresets)) {
      if (w == width && h == height) custom = false;
    }
    if (custom) sizeSelect.value = "custom";
    scheduleInvalidation();
  }));

  //set various map features -- needs trimming
  var updateFeatures = function(overrides = {}) {
    //collect checkbox state
    var features = {};
    $(".map-features input").forEach(el => features[el.id] = el.checked);

    for (var k in overrides) features[k] = overrides[k];

    //zoom guards
    var zoom = map.getZoom();
    if (zoom < 13) {
      features.buildings = false;
    }
    if (zoom < 11) {
      features.transit = false;
    }

    // terrain visibility
    if (state.features.terrain != features.terrain) {
      scene.config.layers.earth.draw.polygons.visible = !features.terrain;
      scene.config.layers.earth.draw.terrain.visible = features.terrain;
      scene.config.global.landuse_style = features.terrain ? "terrain" : "polygons";
    }

    // transit
    if (state.features.transit != features.transit) {
      scene.config.layers.transit.visible = features.transit;
      scene.config.layers[`transit-overlay-station-labels`].visible = features.transit;
    }

    // buildings
    if (state.features.buildings != features.buildings) {
      scene.config.layers.buildings.draw.lines.visible = features.buildings;
      scene.config.layers.buildings.draw.polygons.visible = features.buildings;
      scene.config.layers["swimming-pools"].draw.polygons.visible = features.buildings; // pools
    }

    // labels
    if (state.features.labels != features.labels) {
      scene.config.global.labels_visible = features.labels;
    }

    scene.updateConfig(); // update config

    // save config to do less work next time, hopefully
    state.features = features;
  };

  // override some features, probably should be fixed in YAML
  var forceFeatures = {
    transit: false
  };

  $.one(".map-features").addEventListener("click", () => updateFeatures(forceFeatures));
  map.on("zoomend", () => updateFeatures(forceFeatures));

  // styles for geojson pulled from v1.0
  var geoStyles = {
    LineString: { color:"#cd7139", weight: 4, opacity: 1, lineJoin:"round" },
    Polygon: { color: "#000", weight: 2, opacity: 0.65, fillOpacity: 0, lineJoin:"round" },
    Point: { radius: 10.5, fillColor: "#cd7139",color: "#fff",weight: 1,opacity: 0.3,fillOpacity: 0.8}
  };
  geoStyles.MultiPolygon = geoStyles.Polygon;
  geoStyles.MultiLineString = geoStyles.LineString;

  var onFileSelect = function(evt) {
    // add multiple files to the map
    for (var i = 0; i <  evt.target.files.length; i++) {

      var f = evt.target.files[i];

      var r = new FileReader();
      r.onload = function(e) {

        var contents = e.target.result;
        // turn string into json object
        var parsedJSON = JSON.parse(contents);

        // add GeoJSON to map
        L.geoJson(parsedJSON, {
          style: feature => geoStyles[feature.geometry.type],
          pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, pointStyle);
          }
        }).addTo(map);
      };
      r.readAsText(f);
    }
  };

  $.one(".file-uploader").addEventListener("change", onFileSelect);

  //handle the popup stuff
  var popupInput = $.one(".popup-text");
  var addressInput = $.one(".address");
  var geocodeButton = $.one(".add-from-geocode");

  var addFromGeocode = async function() {
    var text = popupInput.value;
    var address = addressInput.value;
    if (!text || !address) return;
    var coords = await geocoder.address(address);

    var popup = L.popup();
    popup.setLatLng(coords);
    popup.setContent(text);
    popup.addTo(popupLayer);
    map.flyTo(coords);
  };

  geocodeButton.addEventListener("click", addFromGeocode);

  var watchPopupInputs = function(e) {
    if (e.keyCode == 13) addFromGeocode();
  };

  // adding popup on click
  function onClick(e){
    var pop = L.popup();
    pop.setLatLng(e.latlng);
    pop.setContent(prompt("Provide text"));
    pop.addTo(popupLayer);
  }
  map.on("click", onClick);

  [popupInput, addressInput].forEach(el => el.addEventListener("keyup", watchPopupInputs));

})();
