install.patch(async function() {

  var $ = await install("qsa");

  var canvas = document.createElement("canvas");
  var context = canvas.getContext("2d");

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
  var htmlRendering = async function(mapElement) {
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
  var downloadImage = async function(map, scene, popupLayer) {

    var mapElement = map._container;

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
    await htmlRendering(mapElement);

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

  return { downloadImage };

})