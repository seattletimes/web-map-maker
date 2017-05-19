(async function() {

  //required here
  var modules = install.batch("qsa", "geolocation", "util", "debounce", "resizer");
  var [$, geocoder, util, debounce, resizer] = await modules;

  // state is a grab-bag of settings, used instead of random globals
  var state = {
    features: {}
  };
  // canvas used for drawing the downloaded image
  var canvas = document.createElement("canvas");
  var context = canvas.getContext("2d");

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
  frame.addEventListener("resize", debounce(function(e) {
    var custom = true;
    var { width, height } = e.detail;
    for ([w, h] of Object.values(sizePresets)) {
      if (w == width && h == height) custom = false;
    }
    if (custom) sizeSelect.value = "custom";
    scheduleInvalidation();
  }));

  // renders SVG to a canvas (for GeoJSON layers, mostly)
  var drawSVG = async function(element) {
    var svgString = new XMLSerializer().serializeToString(element);
    var DOMURL = self.URL || self.webkitURL || self;
    var img = new Image();
    var svg = new Blob([svgString], {type: "image/svg+xml;charset=utf-8"});
    var url = DOMURL.createObjectURL(svg);

    return new Promise(function(ok, fail) {
      img.onload = function() {
        // be sure to offset it
        var box = element.getAttribute("viewBox");
        var svgOffset = box.split(/\s+|,/).map(Number);

        var svgBounds = element.getBoundingClientRect();
        var srcCoords = {
          x: svgOffset[0] * -1 - (svgBounds.width - mapElement.offsetWidth) / 2,
          y: svgOffset[1] *-1 - (svgBounds.height - mapElement.offsetHeight) / 2
        };
        context.drawImage(img, srcCoords.x, srcCoords.y, svgBounds.width, svgBounds.height);
        ok();
      };
      img.src = url;
    });
  };

  // renders popups and other map junk that isn't the tiles
  var htmlRendering = async function() {
    var rendered = await html2canvas(mapElement, {
      background: undefined,
      logging: true,
      width: mapElement.offsetWidth,
      height: mapElement.offsetHeight
    });
    context.drawImage(rendered, 0, 0, rendered.width, rendered.height);
  };

  // renders the map tiles to the backing canvas
  var processScreenshot = async function(screenshot) {
    var base = new Image();
    base.src = screenshot.url;

    return new Promise(function(ok, fail) {

      base.onload = async function() {
        context.drawImage(base, 0, 0, canvas.width, canvas.height);
        ok();
      }
    });
  };

  // called to trigger the entire download rendering pipeline
  var downloadImage = async function() {

    // clear and resize the screenshot buffer
    canvas.width = mapElement.offsetWidth;
    canvas.height = mapElement.offsetHeight;

    // hide map control and other UI
    mapElement.classList.add("screenshot");

    // render the basic tile map
    var snap = await scene.screenshot();
    await processScreenshot(snap);

    // Super hacky solution to SVG drawing problem: change zoom level then put it back
    // This is here to patch a bug where a small pan of the map will result in
    // geojson/svg objects being cut off in the downloaded image
    // Someday we might have a real solution to the problem but until then ¯\_(ツ)_/¯
    map.setZoom(map.getZoom() - 0.5);
    map.setZoom(map.getZoom() + 0.5);

    // render SVG elements to the buffer (mostly GeoJSON)
    var svgRendering = $(".map svg").length ? drawSVG($.one(".map svg")) : Promise.resolve();
    await svgRendering;

    // temporarily freeze popups in place using left/top instead of transform
    // html2canvas doesn't handle the transforms well
    var origin = mapElement.getBoundingClientRect();
    var frozen = popupLayer.getLayers().map(function(popup) {
      var element = popup._container;
      var bounds = element.getBoundingClientRect();
      var style = element.getAttribute("style");
      element.setAttribute("style", `opacity: 1; position: absolute; top: ${bounds.top - origin.top}px; left: ${bounds.left - origin.left}px;`);
      return { element, style }
    });

    // render HTML elements to the buffer
    await htmlRendering();

    mapElement.classList.remove("screenshot");
    frozen.forEach(ice => ice.element.setAttribute("style", ice.style));

    // create an off-screen anchor tag
    var link = document.createElement("a");
    link.download = `st-map-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");

    // trigger download
    var click = new MouseEvent("click");
    link.dispatchEvent(click);
  };

  $.one(".download").addEventListener("click", downloadImage);

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

    // save config to do less work next time
    state.features = features;
  };

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

  [popupInput, addressInput].forEach(el => el.addEventListener("keyup", watchPopupInputs));

})();