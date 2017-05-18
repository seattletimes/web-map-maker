/* 

let's define our own module system, why not, that's always ended well.

- install() is the equivalent of require, returns a promise
- install.batch() will load multiple files in parallel
- install.patch() == AMD's define(), but does not accept dependencies (use async functions to do that)
- install.stylesheet() adds a link tag for async styles

*/

(function() {
  
  var prefix = document.currentScript.src.replace(/\/[^\/]*?.js$/, "/");
  
  var joinPath = function(base, ...rest) {
    var parts = base.split("/");
    while (parts[parts.length - 1] == "") parts.pop();
    rest.forEach(function(path) {
      var segments = path.split("/");
      segments.forEach(function(p) {
        if (!p || p == ".") return;
        if (p == "..") return parts.pop();
        parts.push(p);
      });
    });
    return parts.join("/");
  };

  var modules = {};
  var requests = {};

  window.install = function(path) {
    path = path.replace(/\.js$/, "");
    if (modules[path]) return modules[path];

    if (!requests[path]) requests[path] = new Promise(function(ok, fail) {
      var script = document.createElement("script");
      var url = joinPath(prefix, path) + ".js";
      script.src = url;
      script.setAttribute("data-module", path);
      document.body.appendChild(script);
      script.onload = () => ok();
      script.onerror = fail;
    });

    return requests[path].then(() => modules[path]);
  };

  window.install.patch = function(module) {
    var script = document.currentScript;
    var path = script.getAttribute("data-module");
    if (typeof module == "function") module = module();
    modules[path] = Promise.resolve(module);
  };

  window.install.stylesheet = function(url) {
    var link = document.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", url);
    document.head.appendChild(link);
  };

  window.install.batch = function(...urls) {
    return Promise.all(urls.map(u => install(u)));
  };

  var root = document.currentScript ? document.currentScript.getAttribute("data-main") : "";
  if (root) install(root);

})();