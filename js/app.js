(async function() {

  var [$, geocoder, util] = await install.batch("qsa", "geolocation", "util");

  var state = {
    buildingsVisible: false,
    terrainVisible: false,
    transitVisible: false,
    labelsVisible: false,
    frozenZoom: false
  };
  var canvas = $.one("canvas");
  var ctx = canvas.getContext("2d");

  // Get window width
  var windowWidth = document.documentElement.clientWidth;
  var windowHeight = document.documentElement.clientHeight;

  // user map options
  // this stores all the user's map edits so they can be reloaded
  var userOptions = {};
  var mapSlug = "st-mapmaker-";

  // build the map's ruler
  var createGrid = function(size) {
    // magic number: why 1600?
    var ratioW = 1600/size,
    ratioH = 1600/size;

    var parent = $("<div />", {
      class: "grid",
      width: ratioW  * size,
      height: ratioH  * size
    }).addClass("grid" + " grid" +size).appendTo("#grid_holder");

    for (var i = 0; i < ratioH; i++) {
      for(var p = 0; p < ratioW; p++){
        $("<div />", {
          width: size - 1,
          height: size - 1
        }).appendTo(parent);
      }
    }
  };

  // magic number: why 1500 here? What does that mean?
  var printRuler = $.one("#col_ruler");
  var pixelRuler = $.one("#pixel_ruler");
  for (var i = 0; i < 1500; i+=10) {
    // checks if fits for print or web columns
    if (i % 330 === 0) {
      printRuler.innerHTML += `<span class="px_measure">${i/330} col</span>`
    } else if (i % 100 === 0 && i <= 1400) {
      pixelRuler.innerHTML += `<span class="px_measure">${i-100} px</span>`;
    }
  }

  // TODO: refactor grid stuff
  // createGrid(50);
  // createGrid(100);
  // createGrid(330);

  var map = L.map("map", {
    attributionControl: true,
    center: [42, -120],
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

  // make map resizable after load
  // TODO: translate this out of jQuery UI into something more manageable
  vectorLayer.on("load",function(){
    // $( function() {
    //   $( "#map_holder" ).resizable({grid:10});
    // } );
  });

  // and update it!
  map.on("zoomend", function() {

    var zoomRounded = Math.floor(map.getZoom()*10) / 10;

    // warning for too close of a zoom
    if (zoomRounded >= 16) {
      $.one("#warning_msg").innerHTML = "WARNING: The map is zoomed in very close. Are major roads or freeways visible for reference?";
    } else {
      $.one("#warning_msg").innerHTML = "";
    }

    $.one("#zoom_level").innerHTML = zoomRounded.toFixed(1);

    //TODO: Not wild about these nested conditionals
    // buildings out under 14 zoom
    if (zoomRounded < 13) {
      $("#buildings_btn").removeClass("active"); // no buildings at zoom
      $("#buildings_btn").css("opacity","0.5"); // update btn opacity
    } else  {
      $("#buildings_btn").css("opacity","1"); // update btn opacity
      if (buildingsVisible) {
        $("#buildings_btn").addClass("active"); // no buildings at zoom
      }
    }

    // transit wont show outside 11 zoom
    if (zoomRounded < 11) {
      $("#transit_btn").removeClass("active"); // update button
      $("#transit_btn").css("opacity","0.5"); // update btn opacity
    } else {
      $("#transit_btn").css("opacity","1"); // update btn opacity
      if (transitVisible) {
        $("#transit_btn").addClass("active"); // update button
      }
    }

  });

  // function to fire after map's parent is resized

  $("#map_holder").resize(function(){
    // get map's size
    var mapHeight = $("#map").height(),
    mapWidth = $("#map").width()

    // update map's size
    $("#map_size").text(mapWidth + "x" + mapHeight);

    // change size to custom
    // TODO: this should be powered by a data structure
    if (mapWidth + "x" + mapHeight == "1920x1080") {
      document.getElementById("preset_sizes").value = "video";
    } else if (mapWidth + "x" + mapHeight == "1300x730") {
      document.getElementById("preset_sizes").value = "web_large";
    } else if (mapWidth + "x" + mapHeight == "400x450") {
      document.getElementById("preset_sizes").value = "web_small";
    } else if (mapWidth % 330 === 0) {
      document.getElementById("preset_sizes").value = "col" + $("#map").width()/330;
    } else {
      document.getElementById("preset_sizes").value = "custom";
    }

    // add mo' map
    setTimeout(() => map.invalidateSize({ pan: false }), 400);
  });


  var handleMouseMove = function(event) {
    var dot, eventDoc, doc, body, pageX, pageY;

    event = event || window.event; // IE-ism

    var pixel = {
      x: event.clientX - $map.offset().left,
      y: event.clientY - $map.offset().top + $(window).scrollTop()
    };
    scene.getFeatureAt(pixel).then(function(selection) {
      // console.log(pixel);
      if (!selection) {
        return;
      }
      var feature = selection.feature;
      if (feature !== null) {
        if (feature.properties !== null) {
          // console.log(feature);

          if (feature.properties.kind == "highway"){
              // console.log(feature.properties.ref);
          } else {
            // console.log(feature.properties.name);
          }
        }
      }
    });
  };

  scene.container.addEventListener("mousemove", handleMouseMove);

  var drawSVG = async function(element) {
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
        var svgOffset = box.split(/\s+|,/);

        var svgSize = [$("#map svg").width(),$("#map svg").height()];
        ctx.drawImage(img, (+svgOffset[0]*-1)-((svgSize[0]-mapSize[0])/2), (+svgOffset[1]*-1)-((svgSize[1]-mapSize[1])/2), svgSize[0], svgSize[1]);
        ok();
      };
      img.src = url;
    });
  };

  var renderHTML = async function() {
    ctx.drawImage(canvas,0,0, mapSize[0], mapSize[1]);
    $(".leaflet-control-zoom").show(); // show zoom again
    $("#map").css("background","#ddd"); // bring back map's background

    // create an off-screen anchor tag
    var lnk = document.createElement("a"),
    e;

    var datetime = Date.now();

    lnk.download = mapSlug + datetime + ".png";

    // compress down canvas
    var canvas = document.getElementById("canvas");
    var image = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");

    lnk.href = image;
    // window.location.href=image;
    if (document.createEvent) {

      e = document.createEvent("MouseEvents");
      e.initMouseEvent("click", true, true, window,
      0, 0, 0, 0, 0, false, false, false,
      false, 0, null);

      lnk.dispatchEvent(e);

    } else if (lnk.fireEvent) {
      lnk.fireEvent("onclick");
    }
  };

  var processScreenshot = async function(screenshot) {
    var baseIMG = new Image();
    baseIMG.src = screenshot.url;

    baseIMG.onload = async function() {
      ctx.drawImage(baseIMG,0,0, mapSize[0], mapSize[1]);

      // Super hacky solution to SVG drawing problem: change zoom level then put it back
      // This is here to patch a bug where a small pan of the map will result in
      // geojson/svg objects being cut off in the downloaded image
      // Someday we might have a real solution to the problem but until then ¯\_(ツ)_/¯
      map.setZoom(map.getZoom() - 0.5);
      map.setZoom(map.getZoom() + 0.5);

      var svgRendering = $("#map svg").length ? drawSVG($.one("svg")) : Promise.resolve();
      await svgRendering;

      // any popup text layers and other html like the source and ruler
      html2canvas($.one("#map"), { onrendered: renderHTML });
    }
  };

  var downloadIMG = async function() {
    if (!mapLoadAction) {

      var mapSize = [$.one("#map").offsetWidth,$("#map").height()];

      // update the canvas' size
      $("#canvas").attr("width",mapSize[0]);
      $("#canvas").attr("height",mapSize[1]);

      var canvasSize = [$("#canvas").width(),$("#canvas").height()];

      // wipe the canvas clean
      ctx.clearRect(0, 0, canvasSize[0], canvasSize[1]);

      // hide map controls buttons
      $("#map").css("background","none");
      $(".leaflet-control-zoom").hide();

      // basemap
      var snap = await scene.screenshot();
      processScreenshot(snap);

    }

  };

  var frozenZoom = false;

  function zoomFreeze() {
    if ($("#zoom_lock").hasClass("active")) {
      $(".leaflet-control-zoom').css('display','block");
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      $("#zoom_lock").removeClass("active");
      frozenZoom = false;
    } else {
      $(".leaflet-control-zoom').css('display','none");
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      $("#zoom_lock").addClass("active");
      frozenZoom = true;
    }

  }

  function panFreeze() {
    if ($("#pan_lock").hasClass("active")) {
      map.dragging.enable();
      map.options.scrollWheelZoom = '';
      $("#pan_lock").removeClass("active");
    } else {
      map.dragging.disable();
      map.options.scrollWheelZoom = "center";
      $("#pan_lock").addClass("active");
    }
  }

  function findFirstDescendant(parent, tagname) {
    parent = document.getElementById(parent);
    var descendants = parent.getElementsByTagName(tagname);
    if ( descendants.length )
    return descendants[0];
  return null;
  }

  var transitVisible = false;
  var labelsVisible = true;
  var terrainVisible = false;


  function showTerrain() {
  // store landuse parent
  var landuse = scene.config.layers.landuse;
  mapLoading();
  if (terrainVisible) {

      // change earth to terrain
      scene.config.layers.earth.draw.polygons.visible = true;
      scene.config.layers.earth.draw.terrain.visible = false;


      // update base landuse
      scene.config.global.landuse_style = "polygons";

      scene.updateConfig(); // update config
      $("#terrain_btn").removeClass("active"); // update button

      terrainVisible = false;
    } else {

      // change earth to terrain
      scene.config.layers.earth.draw.polygons.visible = false;
      scene.config.layers.earth.draw.terrain.visible = true;

      // update base landuse

      scene.config.global.landuse_style = "terrain";

      scene.updateConfig(); // update config
      terrainVisible = true;
      $("#terrain_btn").addClass("active"); // update button
    }
  }

  function showTransit() {
  // check zoom
  if (map.getZoom() >= 11) {
    if (transitVisible) {
          // remove transit
          scene.config.layers.transit.visible = false;
          scene.config.layers["transit-overlay-station-labels"].visible = false;
          scene.updateConfig(); // update config
          $("#transit_btn").removeClass("active"); // update button
          transitVisible = false;
        } else {
          // add transit layer
          scene.config.layers.transit.visible = true;
          scene.config.layers["transit-overlay-station-labels"].visible = true;
          scene.updateConfig(); // update config
          $("#transit_btn").addClass("active"); // update button
          transitVisible = true;
        }
      }
    }

  // auto labels
  function showLabels() {

  // check current status
  if (labelsVisible) {
      // turn all these label layers hidden
      scene.config.global.labels_visible = false;

      labelsVisible = false;

      scene.updateConfig(); // update config
      $("#auto_labels_btn").removeClass("active"); // update button
    } else {
      // turn all these label layers visible
      scene.config.global.labels_visible = true;

      scene.updateConfig(); // update config
      $("#auto_labels_btn").addClass("active"); // update button

      labelsVisible = true;
    }


  }

  // shows and hides buildings and swimming pools
  function showBuildings() {
  // check zoom
  if (map.getZoom() >= 13) {
    if (buildingsVisible) {
          // remove buildings
          scene.config.layers.buildings.draw.lines.visible = false;
          scene.config.layers.buildings.draw.polygons.visible = false;
          scene.config.layers["swimming-pools"].draw.polygons.visible = false; // pools
          scene.updateConfig(); // update config
          $("#buildings_btn").removeClass("active"); // update button
          buildingsVisible = false;
        } else {
          mapLoading();
          // add buildings
          scene.config.layers.buildings.draw.lines.visible = true;
          scene.config.layers.buildings.draw.polygons.visible = true;
          scene.config.layers["swimming-pools"].draw.polygons.visible = true; // pools
          scene.updateConfig(); // update config
          $("#buildings_btn").addClass("active"); // update button
          buildingsVisible = true;
        }
      }
  } // showBuildings()

  // watching for anytime the size preset dropdown fires
  var sizeChange = function(option) {
    if (option.value == "video") {
      $("#map_holder").width(1930); // these have to be 10 over to compensate for resizable
      $("#map_holder").height(1080);
    } else if (option.value == "web_large") {
      $("#map_holder").width(1310);
      $("#map_holder").height(730);
    } else if (option.value == "web_small") {
      $("#map_holder").width(410);
      $("#map_holder").height(450);
    } else if (option.value == "col1") {
      $("#map_holder").width(340);
      $("#map_holder").height(700);
    } else if (option.value == "col2") {
      $("#map_holder").width(670);
      $("#map_holder").height(700);
    } else if (option.value == "col3") {
      $("#map_holder").width(1000);
      $("#map_holder").height(700);
    } else if (option.value == "col4") {
      $("#map_holder").width(1330);
      $("#map_holder").height(700);
    } else if (option.value == "twitter") {
      $("#map_holder").width(800);
      $("#map_holder").height(400);
    }

    // update map's size
    mapSize = $("#map").width() + "x" + $("#map").height();
    $("#map_size").text(mapSize);

    setTimeout(
    function(){
          // add mo' map
          map.invalidateSize({ pan: false });
          // $( "#map_holder" ).resizable({grid:10});
        }, 400
        );

  };

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

  // Apple's Magic Mouse is a little finicky--prevent scroll when mouse is down on map
  $("#map").mousedown(function() {
    map.scrollWheelZoom.disable();
  });
  $("#map").mouseup(function() {
    if (!frozenZoom) {
      map.scrollWheelZoom.enable();
    }
  });


  // styles for geojson pulled from v1.0
  var lineStyle = {color:"#cd7139",weight: 4,opacity: 1, lineJoin:"round"};
  var polyStyle = {color: "#000",weight: 2,opacity: 0.65,fillOpacity: 0, lineJoin:"round"};
  var pointStyle = { radius: 10.5, fillColor: "#cd7139",color: "#fff",weight: 1,opacity: 0.3,fillOpacity: 0.8};

  function addStyle(feature){
    switch (feature.geometry.type) {
      case "MultiPolygon": return polyStyle;
      case "Polygon": return polyStyle;
      case "MultiLineString": return lineStyle;
      case "LineString": return lineStyle;
      case "Point": return pointStyle;
    }
  }

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
          style: function(feature) {return addStyle(feature);},
          pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, pointStyle);
          }
        }).addTo(map);
      };
      r.readAsText(f);
    }
  };

  $.one("#geo_files").addEventListener("change", handleFileSelect);

  var mapLoadAction = true;

  // show that map is still loading
  function mapLoading() {
    if (scene.tile_manager.isLoadingVisibleTiles()) {
      $("#download_img").html(`Image loading...<img src="images/preloader.gif" alt="Preloader" id="map_loader" />`);
      $("#download_img").addClass("gray");
      mapLoadAction = true;
    }
  }

  // listen for anything causing a possible map update
  scene.subscribe({
    move: function () {
      mapLoading();
    }
  });

  // fire when map is down loading
  scene.subscribe({
    view_complete: function () {
      $("#download_img").html("Download image");
      $("#download_img").removeClass("gray");
      mapLoadAction = false;
    },
    error: function (e) {
      console.log("scene error:", e);
    },
    warning: function (e) {
      console.log("scene warning:", e);
    }
  });

})();