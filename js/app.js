(async function() {

  //other modules
  install.batch("resizer");
  //required here
  var [$, geocoder, util, debounce] = await install.batch("qsa", "geolocation", "util", "debounce");

  var state = {
    features: {},
    dimensions: {
      width: 800,
      height: 600
    }
  };
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d");

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

  map.attributionControl.setPrefix("Mapzen, OpenStreetMap");

  var vectorLayer = Tangram.leafletLayer({ scene: "map-styles.yaml" });
  vectorLayer.addTo(map);
  var scene = vectorLayer.scene;

  var scheduleInvalidation = function() {
    setTimeout(() => map.invalidateSize());
  };

  frame.addEventListener("resize", debounce(scheduleInvalidation));

  var drawSVG = async function(element) {
    console.log(element);
    var svgString = new XMLSerializer().serializeToString(element);
    var DOMURL = self.URL || self.webkitURL || self;
    var img = new Image();
    var svg = new Blob([svgString], {type: "image/svg+xml;charset=utf-8"});
    var url = DOMURL.createObjectURL(svg);

    return new Promise(function(ok, fail) {
      img.onload = function() {
        // be sure to offset it
        var svg1 = document.querySelector("svg");
        var box = svg1.getAttribute("viewBox");
        var svgOffset = box.split(/\s+|,/).map(Number);

        var svgBounds = svg.getBoundingClientRect();
        var srcCoords = {
          x: svgOffset[0] * -1 - (svgBounds.width - mapElement.offsetWidth) / 2,
          y: svgOffset[1] *-1 - (svgBounds.height - mapElement.offsetHeight) / 2
        }
        ctx.drawImage(img, svgCoords.width, svgCoords.height, svgBounds.width, svgBounds.height);
        ok();
      };
      img.src = url;
    });
  };

  var htmlRendering = function() {
    return new Promise(function(ok, fail) {
      html2canvas(mapElement, { onrendered: function(rendered) {
        ctx.drawImage(rendered, 0, 0, mapElement.width, mapElement.height);
        ok();
      }})
    });
  };

  var processScreenshot = async function(screenshot) {
    var base = new Image();
    base.src = screenshot.url;

    return new Promise(function(ok, fail) {

      base.onload = async function() {
        ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
        ok();
      }
    });
  };

  var downloadImage = async function() {

    canvas.width = mapElement.offsetWidth;
    canvas.height = mapElement.offsetHeight;

    // hide map controls buttons
    mapElement.classList.add("screenshot");

    // basemap
    var snap = await scene.screenshot();
    await processScreenshot(snap);

    // Super hacky solution to SVG drawing problem: change zoom level then put it back
    // This is here to patch a bug where a small pan of the map will result in
    // geojson/svg objects being cut off in the downloaded image
    // Someday we might have a real solution to the problem but until then ¯\_(ツ)_/¯
    map.setZoom(map.getZoom() - 0.5);
    map.setZoom(map.getZoom() + 0.5);

    var svgRendering = $("#map svg").length ? drawSVG($.one("svg")) : Promise.resolve();
    await svgRendering;
    await htmlRendering;

    // create an off-screen anchor tag
    var link = document.createElement("a");
    link.download = `st-map-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");

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

    state.features = features;
  };

  $.one(".map-features").addEventListener("click", () => updateFeatures());
  map.on("zoomend", () => updateFeatures());

  function showPrint() {
    // swap to print color
    scene.config.global.road_color = "#98a5ac";

    // bump up size of major roads
    scene.config.layers.roads.major_road.draw.lines.width[3][1] = "1.5px";
    scene.config.layers.roads.major_road.draw.lines.width[4][1] = "2.5px";
    scene.config.layers.roads.major_road.draw.lines.width[5][1] = "3.5px";
    scene.config.layers.roads.major_road.draw.lines.width[6][1] = "10m";

    // bump up size of minor roads
    scene.config.layers.roads.minor_road.draw.lines.width[1][1] = "0.5px";
    scene.config.layers.roads.minor_road.draw.lines.width[2][1] = "0.5px";

    // make water darker
    scene.config.global.water_color = "#a6bcd3";

    // turn off labels
    labelsVisible = true;
    showLabels();

    scene.updateConfig(); // update config

    // update buttons
    $("#print_btn").addClass("active");
    $("#web_btn").removeClass("active");

    // hide attribution
    $(".leaflet-control-attribution").hide();

  }

  function showWeb() {
    scene.load("map-styles.yaml");
    buildingsVisible = false;
    // update buttons
    $("#print_btn").removeClass("active");
    $("#web_btn").addClass("active");
    $("#auto_labels_btn").addClass("active");
    labelsVisible = true;

    // bring back attribution
    $(".leaflet-control-attribution").show();
  }

  // styles for geojson pulled from v1.0
  var geoStyles = {
    LineString: { color:"#cd7139", weight: 4, opacity: 1, lineJoin:"round" },
    Polygon: { color: "#000", weight: 2, opacity: 0.65, fillOpacity: 0, lineJoin:"round" },
    Point: { radius: 10.5, fillColor: "#cd7139",color: "#fff",weight: 1,opacity: 0.3,fillOpacity: 0.8}
  };
  geoStyles.MultiPolygon = geoStyles.Polygon;
  geoStyles.MultiLineString = geoStyles.LineString;

  var handleFileSelect = function(evt) {
    // add multiple files to the map
    for (var i = 0; i <  evt.target.files.length; i++) {

      var f = evt.target.files[i];

      var r = new FileReader();
      r.onload = function(e) {

        var contents = e.target.result;
        // turn string into json object
        var parsedJSON = jQuery.parseJSON(contents);

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

})();