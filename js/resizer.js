install.patch(async function() {

  var $ = await install("qsa");

  var handle = $.one(".resize-handle");
  var frame = $.one(".map-frame");
  var status = $.one(".dimensions");

  var onHandleDown = function(e) {
    e.preventDefault();
    e.stopPropagation();
    document.body.addEventListener("mousemove", onMove);
    document.body.addEventListener("mouseup", onHandleUp);
  };

  var updateSize = function() {
    //get actual rendered size
    width = frame.offsetWidth;
    height = frame.offsetHeight;
    status.innerHTML = `${width}x${height}`;
    var event = new CustomEvent("resize", { detail: { width, height }});
    frame.dispatchEvent(event);
  };

  var onMove = function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var bounds = frame.getBoundingClientRect();
    var width = e.clientX - bounds.left;
    var height = e.clientY - bounds.top;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    updateSize();
  };

  var onHandleUp = function() {
    document.body.removeEventListener("mousemove", onMove);
    document.body.removeEventListener("mouseup", onHandleUp);
  };

  handle.addEventListener("mousedown", onHandleDown);
  window.addEventListener("resize", updateSize);

  updateSize();

  return {
    resize: function(width, height) {
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      updateSize();
    }
  }

});