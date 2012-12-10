(function (userConfig, defaultConfig) {
	/*global process:false */
	/*jshint evil:true */

	// summary:
	//		This is the "source loader" and is the entry point for Dojo during development. You may also load Dojo with
	//		any AMD-compliant loader via the package main module dojo/main.
	// description:
	//		This is the "source loader" for Dojo. It provides an AMD-compliant loader that can be configured
	//		to operate in either synchronous or asynchronous modes. After the loader is defined, dojo is loaded
	//		IAW the package main module dojo/main. In the event you wish to use a foreign loader, you may load dojo as a package
	//		via the package main module dojo/main and this loader is not required; see dojo/package.json for details.
	//
	//		In order to keep compatibility with the v1.x line, this loader includes additional machinery that enables
	//		the dojo.provide, dojo.require et al API. This machinery is loaded by default, but may be dynamically removed
	//		via the has.js API and statically removed via the build system.
	//
	//		This loader includes sniffing machinery to determine the environment; the following environments are supported:
	//
	//		- browser
	//		- node.js
	//
	//		This is the so-called "source loader". As such, it includes many optional features that may be discarded by
	//		building a customized version with the build system.

	// Design and Implementation Notes
	//
	// This is a dojo-specific adaption of bdLoad, donated to the dojo foundation by Altoviso LLC.
	//
	// This function defines an AMD-compliant (http://wiki.commonjs.org/wiki/Modules/AsynchronousDefinition)
	// loader that can be configured to operate in either synchronous or asynchronous modes.
	//
	// Since this machinery implements a loader, it does not have the luxury of using a load system and/or
	// leveraging a utility library. This results in an unpleasantly long file; here is a road map of the contents:
	//
	//	 1. Small library for use implementing the loader.
	//	 2. Define the has.js API; this is used throughout the loader to bracket features.
	//	 3. Define the node.js sniff and sniff.
	//	 4. Define the loader's data.
	//	 5. Define the configuration machinery.
	//	 6. Define the script element sniffing machinery and sniff for configuration data.
	//	 7. Configure the loader IAW the provided user, default, and sniffing data.
	//	 8. Define the global require function.
	//	 9. Define the module resolution machinery.
	//	10. Define the module and plugin module definition machinery
	//	11. Define the script injection machinery.
	//	12. Define the window load detection.
	//	13. Define the logging API.
	//	14. Define the tracing API.
	//	16. Define the AMD define function.
	//	17. Define the dojo v1.x provide/require machinery--so called "legacy" modes.
	//	18. Publish global variables.
	//
	// Language and Acronyms and Idioms
	//
	// moduleId: a CJS module identifier, (used for public APIs)
	// mid: moduleId (used internally)
	// packageId: a package identifier (used for public APIs)
	// pid: packageId (used internally); the implied system or default package has pid===""
	// pack: package is used internally to reference a package object (since javascript has reserved words including "package")
	// prid: plugin resource identifier

	// define a minimal library to help build the loader
	var noop = function () {},

		isEmpty = function (object) {
			var k;
			for (k in object) {
				return false;
			}
			return true;
		},

		isFunction = function (object) {
			return typeof object === 'function';
		},

		isString = function (object) {
			return typeof object === 'string';
		},

		isArray = function (object) {
			return Array.isArray(object);
		},

		forEach = function (array, callback) {
			array && array.forEach(callback);
		},

		mix = function (dest, src) {
			for (var k in src) {
				dest[k] = src[k];
			}
			return dest;
		},

		makeError = function (error, info) {
			return mix(new Error(error), { src: 'dojoLoader', info: info });
		},

		// this will be the global require function; define it immediately so we can start hanging things off of it
		/**
		 * TODOC.
		 * @param config       //(object, optional) hash of configuration properties
		 * @param dependencies //(array of commonjs.moduleId, optional) list of modules to be loaded before applying callback
		 * @param callback     //(function, optional) lambda expression to apply to module values implied by dependencies
		 */
		req = function (config, dependencies, callback) {
			return contextRequire(config, dependencies, callback, null, req);
		},

		// the loader uses the has.js API to control feature inclusion/exclusion; define then use throughout
		global = this,
		doc = global.document,
		element = doc && doc.createElement('DiV'),

		has = req.has = function (name) {
			return isFunction(hasCache[name]) ? (hasCache[name] = hasCache[name](global, doc, element)) : hasCache[name];
		},

		hasCache = has.cache = defaultConfig.hasCache;

	has.add = function (name, test, now, force) {
		(hasCache[name] === undefined || force) && (hasCache[name] = test);
		return now && has(name);
	};

	has.add('host-node', userConfig.has && 'host-node' in userConfig.has ?
		userConfig.has['host-node'] :
		(typeof process === 'object' && process.versions && process.versions.node));

	if (has('host-node')) {
		// fixup the default config for node.js environment
		require('./configNode.js').config(defaultConfig);
		// remember node's require (with respect to baseUrl==dojo's root)
		defaultConfig.loaderPatch.nodeRequire = require;
	}

	// userConfig has tests override defaultConfig has tests; do this after the environment detection because
	// the environment detection usually sets some has feature values in the hasCache.
	for (var k in userConfig.has) {
		has.add(k, userConfig.has[k], false, true);
	}

	//
	// define the loader data
	//

	// the loader will use these like symbols if the loader has the traceApi; otherwise
	// define magic numbers so that modules can be provided as part of defaultConfig
	var REQUESTED = 'requested',
		ARRIVED = 'arrived',
		NON_MODULE = 'non-module',
		EXECUTING = 'executing',
		EXECUTED = 'executed';

	//
	// loader eval
	//
	req.eval = (function () {
		// use the function constructor so our eval is scoped close to (but not in) in the global space with minimal pollution
		var evil = new Function('return eval(arguments[0]);');

		return function (text, hint) {
			return evil(text + '\r\n////@ sourceURL=' + hint);
		};
	}());

	//
	// loader micro events API
	//
	var listenerQueues = {},
		ERROR = 'error',
		signal = req.signal = function (type, args) {
			var queue = listenerQueues[type];
			// notice we run a copy of the queue; this allows listeners to add/remove
			// other listeners without affecting this particular signal
			forEach(queue && queue.slice(0), function (listener) {
				listener.apply(null, isArray(args) ? args : [args]);
			});
		},
		on = req.on = function (type, listener) {
			// notice a queue is not created until a client actually connects
			var queue = listenerQueues[type] || (listenerQueues[type] = []);
			queue.push(listener);
			return {
				remove: function () {
					for (var i = 0; i < queue.length; i++) {
						if (queue[i] === listener) {
							queue.splice(i, 1);
							return;
						}
					}
				}
			};
		};

	// configuration machinery; with an optimized/built defaultConfig, all configuration machinery can be discarded
	// lexical variables hold key loader data structures to help with minification; these may be completely,
	// one-time initialized by defaultConfig for optimized/built versions
	var pathsMapProg
			// list of (from-path, to-path, regex, length) derived from paths;
			// a "program" to apply paths; see computeMapProg
			= [],

		packs
			// a map from packageId to package configuration object; see fixupPackageInfo
			= {},

		map = req.map
			// AMD map config variable; dojo/_base/kernel needs req.map to figure out the scope map
			= {},

		mapProgs
			// array of quads as described by computeMapProg; map-key is AMD map key, map-value is AMD map value
			= [],

		modules
			// A hash:(mid) --> (module-object) the module namespace
			//
			// pid: the package identifier to which the module belongs (e.g., "dojo"); "" indicates the system or default package
			// mid: the fully-resolved (i.e., mappings have been applied) module identifier without the package identifier (e.g., "dojo/io/script")
			// url: the URL from which the module was retrieved
			// pack: the package object of the package to which the module belongs
			// executed: false => not executed; "executing" => in the process of traversing deps and running factory; "executed" => factory has been executed
			// deps: the dependency array for this module (array of modules objects)
			// def: the factory for this module
			// result: the result of the running the factory for this module
			// injected: (false | "requested" | "arrived") the status of the module; "non-module" means the resource did not call define
			// load: plugin load function; applicable only for plugins
			//
			// Modules go through several phases in creation:
			//
			// 1. Requested: some other module's definition or a require application contained the requested module in
			//    its dependency array or executing code explicitly demands a module via req.require.
			//
			// 2. Injected: a script element has been appended to the insert-point element demanding the resource implied by the URL
			//
			// 3. Loaded: the resource injected in [2] has been evaluated.
			//
			// 4. Defined: the resource contained a define statement that advised the loader about the module. Notice that some
			//    resources may just contain a bundle of code and never formally define a module via define
			//
			// 5. Evaluated: the module was defined via define and the loader has evaluated the factory and computed a result.
			= {},

		cacheBust
			// query string to append to module URLs to bust browser cache
			= '',

		cache
			// hash:(mid | url)-->(function | string)
			//
			// A cache of resources. The resources arrive via a config.cache object, which is a hash from either mid --> function or
			// url --> string. The url key is distinguished from the mid key by always containing the prefix "url:". url keys as provided
			// by config.cache always have a string value that represents the contents of the resource at the given url. mid keys as provided
			// by configl.cache always have a function value that causes the same code to execute as if the module was script injected.
			//
			// Both kinds of key-value pairs are entered into cache via the function consumePendingCache, which may relocate keys as given
			// by any mappings *iff* the config.cache was received as part of a module resource request.
			//
			// Further, for mid keys, the implied url is computed and the value is entered into that key as well. This allows mapped modules
			// to retrieve cached items that may have arrived consequent to another namespace.
			//
			 = {},

		urlKeyPrefix
			// the prefix to prepend to a URL key in the cache.
			= 'url:',

		pendingCacheInsert
			// hash:(mid)-->(function)
			//
			// Gives a set of cache modules pending entry into cache. When cached modules are published to the loader, they are
			// entered into pendingCacheInsert; modules are then pressed into cache upon (1) AMD define or (2) upon receiving another
			// independent set of cached modules. (1) is the usual case, and this case allows normalizing mids given in the pending
			// cache for the local configuration, possibly relocating modules.
			 = {};

	if (has('dojo-config-api')) {
		var consumePendingCacheInsert = function (referenceModule) {
				var k,
					item,
					match,
					now,
					m;

				for (k in pendingCacheInsert) {
					item = pendingCacheInsert[k];
					match = k.match(/^url\:(.+)/);
					if (match) {
						cache[urlKeyPrefix + toUrl(match[1], referenceModule)] = item;
					} else if (k === '*now') {
						now = item;
					} else if (k !== '*noref') {
						m = getModuleInfo(k, referenceModule);
						cache[m.mid] = cache[urlKeyPrefix + m.url] = item;
					}
				}
				if (now) {
					now(createRequire(referenceModule));
				}
				pendingCacheInsert = {};
			},

			computeMapProg = function (map, dest) {
				// This routine takes a map as represented by a JavaScript object and initializes dest, a array of
				// quads of (map-key, map-value, refex-for-map-key, length-of-map-key), sorted decreasing by length-
				// of-map-key. The regex looks for the map-key followed by either "/" or end-of-string at the beginning
				// of a the search source. Notice the map-value is irrelevant to the algorithm
				dest.splice(0, dest.length);
				for (var k in map) {
					dest.push([
						k,
						map[k],
						new RegExp('^' + k.replace(/[-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&') + '(?:\/|$)'),
						k.length
					]);
				}
				dest.sort(function (lhs, rhs) { return rhs[3] - lhs[3]; });
				return dest;
			},

			fixupPackageInfo = function (packageInfo) {
				// calculate the precise (name, location, main, mappings) for a package
				var name = packageInfo.name;
				if (!name) {
					// packageInfo must be a string that gives the name
					name = packageInfo;
					packageInfo = { name: name };
				}
				packageInfo = mix({ main: 'main' }, packageInfo);
				packageInfo.location = packageInfo.location ? packageInfo.location : name;

				// packageMap is deprecated in favor of AMD map
				if (packageInfo.packageMap) {
					map[name] = packageInfo.packageMap;
				}

				if (!packageInfo.main.indexOf('./')) {
					packageInfo.main = packageInfo.main.substring(2);
				}

				// now that we've got a fully-resolved package object, push it into the configuration
				packs[name] = packageInfo;
			},

			delayedModuleConfig
				// module config cannot be consumed until the loader is completely initialized; therefore, all
				// module config detected during booting is memorized and applied at the end of loader initialization
				// TODO: this is a bit of a kludge; all config should be moved to end of loader initialization, but
				// we'll delay this chore and do it with a final loader 1.x cleanup after the 2.x loader prototyping is complete
				= [],


			config = function (config, booting, referenceModule) {
				for (var k in config) {
					if (k === 'waitSeconds') {
						req.waitms = (config[k] || 0) * 1000;
					}
					if (k === 'cacheBust') {
						cacheBust = config[k] ? (isString(config[k]) ? config[k] : (new Date()).getTime() + '') : '';
					}
					if (k === 'baseUrl' || k === 'combo') {
						req[k] = config[k];
					}
					if (config[k] !== hasCache) {
						// accumulate raw config info for client apps which can use this to pass their own config
						req.rawConfig[k] = config[k];
						k !== 'has' && has.add('config-' + k, config[k], false, booting);
					}
				}

				// make sure baseUrl exists
				if (!req.baseUrl) {
					req.baseUrl = './';
				}
				// make sure baseUrl ends with a slash
				if (!/\/$/.test(req.baseUrl)) {
					req.baseUrl += '/';
				}

				// now do the special work for has, packages, packagePaths, paths, aliases, and cache

				for (k in config.has) {
					has.add(k, config.has[k], false, booting);
				}

				// for each package found in any packages config item, augment the packs map owned by the loader
				forEach(config.packages, fixupPackageInfo);

				// notice that computeMapProg treats the dest as a reference; therefore, if/when that variable
				// is published (see dojo-publish-privates), the published variable will always hold a valid value.

				// this must come after all package processing since package processing may mutate map
				computeMapProg(mix(map, config.map), mapProgs);
				forEach(mapProgs, function (item) {
					item[1] = computeMapProg(item[1], []);
					if (item[0] === '*') {
						mapProgs.star = item;
					}
				});

				if (booting) {
					delayedModuleConfig.push({ config: config.config });
				}
				else {
					for (k in config.config) {
						var module = getModule(k, referenceModule);
						module.config = mix(module.config || {}, config.config[k]);
					}
				}

				// push in any new cache values
				if (config.cache) {
					consumePendingCacheInsert();
					pendingCacheInsert = config.cache;
					if (config.cache['*noref']) {
						consumePendingCacheInsert();
					}
				}

				signal('config', [config, req.rawConfig]);
			};

		//
		// execute the various sniffs; userConfig can override and value
		//

		if (has('dojo-cdn') || has('dojo-sniff-baseUrl')) {
			(function () {
				var script = doc.currentScript || doc.scripts[doc.scripts.length - 1],
					baseUrl = /^(.*?)\/[^\/]+(?:\?.*)?$/.exec(script.src)[1];

				defaultConfig.baseUrl = defaultConfig.baseUrl || baseUrl;

				// sniff requirejs attribute
				if (has('dojo-requirejs-api')) {
					var dataMain = script.getAttribute('data-main');
					if (dataMain) {
						defaultConfig.deps = defaultConfig.deps || [ dataMain ];
					}
				}

				if (has('dojo-cdn')) {
					packs.dojo.location = baseUrl;
					if (baseUrl) {
						baseUrl += '/';
					}
					packs.dijit.location = baseUrl + '../dijit/';
					packs.dojox.location = baseUrl + '../dojox/';
				}
			}());
		}

		// configure the loader; let the user override defaults
		req.rawConfig = {};
		config(defaultConfig, true);
		config(userConfig, true);
	}
	else {
		// no config API, assume defaultConfig has everything the loader needs...for the entire lifetime of the application
		pathsMapProg = defaultConfig.pathsMapProg;
		packs = defaultConfig.packs;
		mapProgs = defaultConfig.mapProgs;
		modules = defaultConfig.modules;
		cache = defaultConfig.cache;
		cacheBust = defaultConfig.cacheBust;

		// remember the default config for other processes (e.g., dojo/config)
		req.rawConfig = defaultConfig;
	}

	// build the loader machinery iaw configuration, including has feature tests
	var injectDependencies = function (module) {
			// checkComplete!=false holds the idle signal; we're not idle if we're injecting dependencies
			guardCheckComplete(function () {
				forEach(module.deps, injectModule);
			});
		},

		uid = 0,
		contextRequire = function (a1, a2, a3, referenceModule, contextRequire) {
			var module, syntheticMid;
			if (isString(a1)) {
				// signature is (moduleId)
				module = getModule(a1, referenceModule, true);
				if (module && module.executed) {
					return module.result;
				}
				throw makeError('undefinedModule', a1);
			}
			if (!isArray(a1)) {
				// a1 is a configuration
				config(a1, false, referenceModule);

				// juggle args; (a2, a3) may be (dependencies, callback)
				a1 = a2;
				a2 = a3;
			}
			if (isArray(a1)) {
				// signature is (requestList [,callback])
				if (!a1.length) {
					a2 && a2();
				}
				else {
					syntheticMid = 'require*' + (uid++);

					// resolve the request list with respect to the reference module
					for (var mid, deps = [], i = 0; i < a1.length;) {
						mid = a1[i++];
						deps.push(getModule(mid, referenceModule));
					}

					// construct a synthetic module to control execution of the requestList, and, optionally, callback
					module = mix(makeModuleInfo('', syntheticMid, null, ''), {
						injected: ARRIVED,
						deps: deps,
						def: a2 || noop,
						require: referenceModule ? referenceModule.require : req,
						gc: true //garbage collect
					});
					modules[module.mid] = module;

					// checkComplete!=false holds the idle signal; we're not idle if we're injecting dependencies
					injectDependencies(module);

					// try to immediately execute
					// if already traversing a factory tree, then strict causes circular dependency to abort the execution; maybe
					// it's possible to execute this require later after the current traversal completes and avoid the circular dependency.
					// ...but *always* insist on immediate in synch mode
					var strict = checkCompleteGuard;
					guardCheckComplete(function () {
						execModule(module, strict);
					});
					if (!module.executed) {
						// some deps weren't on board or circular dependency detected and strict; therefore, push into the execQ
						execQ.push(module);
					}
					checkComplete();
				}
			}
			return contextRequire;
		},

		createRequire = function (module) {
			if (!module) {
				return req;
			}
			var result = module.require;
			if (!result) {
				result = function (a1, a2, a3) {
					return contextRequire(a1, a2, a3, module, result);
				};
				module.require = mix(result, req);
				result.module = module;
				result.toUrl = function (name) {
					return toUrl(name, module);
				};
				result.toAbsMid = function (mid) {
					return toAbsMid(mid, module);
				};
				if (has('dojo-undef-api')) {
					result.undef = function (mid) {
						req.undef(mid, module);
					};
				}
			}
			return result;
		},

		execQ =
			// The list of modules that need to be evaluated.
			[],

		defQ =
			// The queue of define arguments sent to loader.
			[],

		waiting =
			// The set of modules upon which the loader is waiting for definition to arrive
			{},

		setRequested = function (module) {
			module.injected = REQUESTED;
			waiting[module.mid] = true;
			if (module.url) {
				waiting[module.url] = module.pack || true;
			}
			startTimer();
		},

		setArrived = function (module) {
			module.injected = ARRIVED;
			delete waiting[module.mid];
			if (module.url) {
				delete waiting[module.url];
			}
			if (isEmpty(waiting)) {
				clearTimer();
			}
		},

		execComplete = req.idle =
			// says the loader has completed (or not) its work
			function () {
				return !defQ.length && isEmpty(waiting) && !execQ.length && !checkCompleteGuard;
			},

		runMapProg = function (targetMid, map) {
			// search for targetMid in map; return the map item if found; falsy otherwise
			if (map) {
				for (var i = 0; i < map.length; i++) {
					if (map[i][2].test(targetMid)) {
						return map[i];
					}
				}
			}
			return false;
		},

		compactPath = function (path) {
			var result = [],
				segment,
				lastSegment;

			path = path.replace(/\\/g, '/').split('/');
			while (path.length) {
				segment = path.shift();
				if (segment === '..' && result.length && lastSegment !== '..') {
					result.pop();
					lastSegment = result[result.length - 1];
				}
				else if (segment !== '.') {
					result.push((lastSegment = segment));
				} // else ignore "."
			}
			return result.join('/');
		},

		makeModuleInfo = function (pid, mid, pack, url) {
			return {
				pid: pid,
				mid: mid,
				pack: pack,
				url: url,
				executed: false,
				def: false
			};
		},

		_getModuleInfo = function (mid, referenceModule, packs, modules, baseUrl, mapProgs, pathsMapProg, alwaysCreate) {
			// arguments are passed instead of using lexical variables so that this function my be used independent of the loader (e.g., the builder)
			// alwaysCreate is useful in this case so that getModuleInfo never returns references to real modules owned by the loader
			var pid,
				pack,
				midInPackage,
				mapItem,
				url,
				result,
				isRelative,
				requestedMid;

			requestedMid = mid;
			isRelative = /^\./.test(mid);
			if (/(^\/)|(\:)|(\.js$)/.test(mid) || (isRelative && !referenceModule)) {
				// absolute path or protocol of .js filetype, or relative path but no reference module and therefore relative to page
				// whatever it is, it's not a module but just a URL of some sort
				// note: pid===null indicates the routine is returning an unmodified mid

				return makeModuleInfo(null, mid, null, mid);
			}
			else {
				// relative module ids are relative to the referenceModule; get rid of any dots
				mid = compactPath(isRelative ? (referenceModule.mid + '/../' + mid) : mid);
				if (/^\./.test(mid)) {
					throw makeError('irrationalPath', mid);
				}
				// at this point, mid is an absolute mid

				// map the mid
				if (referenceModule) {
					mapItem = runMapProg(referenceModule.mid, mapProgs);
				}
				mapItem = mapItem || mapProgs.star;
				mapItem = mapItem && runMapProg(mid, mapItem[1]);

				if (mapItem) {
					mid = mapItem[1] + mid.substring(mapItem[3]);
				}

				var match = mid.match(/^([^\/]+)(\/(.+))?$/);
				pid = match ? match[1] : '';
				if ((pack = packs[pid])) {
					mid = pid + '/' + (midInPackage = (match[3] || pack.main));
				}
				else {
					pid = '';
				}

				result = modules[mid];
				if (result) {
					return alwaysCreate ? makeModuleInfo(result.pid, result.mid, result.pack, result.url) : modules[mid];
				}
			}
			// get here iff the sought-after module does not yet exist; therefore, we need to compute the URL given the
			// fully resolved (i.e., all relative indicators and package mapping resolved) module id

			// note: pid!==null indicates the routine is returning a url that has .js appended unmodified mid
			mapItem = runMapProg(mid, pathsMapProg);
			if (mapItem) {
				url = mapItem[1] + mid.substring(mapItem[3]);
			}
			else if (pid) {
				url = pack.location + '/' + midInPackage;
			}
			else {
				url = mid;
			}
			// if result is not absolute, add baseUrl
			if (!(/(^\/)|(\:)/.test(url))) {
				url = baseUrl + url;
			}
			url += '.js';
			return makeModuleInfo(pid, mid, pack, compactPath(url));
		},

		getModuleInfo = function (mid, referenceModule) {
			return _getModuleInfo(mid, referenceModule, packs, modules, req.baseUrl, mapProgs, pathsMapProg);
		},

		resolvePluginResourceId = function (plugin, prid, referenceModule) {
			return plugin.normalize ? plugin.normalize(prid, function (mid) {
				return toAbsMid(mid, referenceModule);
			}) : toAbsMid(prid, referenceModule);
		},

		dynamicPluginUidGenerator = 0,

		getModule = function (mid, referenceModule, immediate) {
			// compute and optionally construct (if necessary) the module implied by the mid with respect to referenceModule
			var match, plugin, prid, result;
			match = mid.match(/^(.+?)\!(.*)$/);
			if (match) {
				// name was <plugin-module>!<plugin-resource-id>
				plugin = getModule(match[1], referenceModule, immediate);

				if (plugin.executed === EXECUTED && !plugin.load) {
					// executed the module not knowing it was a plugin
					promoteModuleToPlugin(plugin);
				}

				// if the plugin has not been loaded, then can't resolve the prid and must assume this plugin is dynamic until we find out otherwise
				if (plugin.load) {
					prid = resolvePluginResourceId(plugin, match[2], referenceModule);
					mid = (plugin.mid + '!' + (plugin.dynamic ? ++dynamicPluginUidGenerator + '!' : '') + prid);
				}
				else {
					prid = match[2];
					mid = plugin.mid + '!' + (++dynamicPluginUidGenerator) + '!waitingForPlugin';
				}

				result = {
					plugin: plugin,
					mid: mid,
					req: createRequire(referenceModule),
					prid: prid
				};
			}
			else {
				result = getModuleInfo(mid, referenceModule);
			}
			return modules[result.mid] || (!immediate && (modules[result.mid] = result));
		},

		toAbsMid = req.toAbsMid = function (mid, referenceModule) {
			return getModuleInfo(mid, referenceModule).mid;
		},

		toUrl = req.toUrl = function (name, referenceModule) {
			var moduleInfo = getModuleInfo(name + '/x', referenceModule),
				url = moduleInfo.url;

			return fixupUrl(moduleInfo.pid === null ?
				// if pid===null, then name had a protocol or absolute path; either way, toUrl is the identify function in such cases
				name :
				// "/x.js" since getModuleInfo automatically appends ".js" and we appended "/x" to make name look like a module id
				url.substring(0, url.length - 5)
			);
		},

		nonModuleProps = {
			injected: ARRIVED,
			executed: EXECUTED,
			def: NON_MODULE,
			result: NON_MODULE
		},

		makeCjs = function (mid) {
			return modules[mid] = mix({ mid: mid }, nonModuleProps);
		},

		cjsRequireModule = makeCjs('require'),
		cjsExportsModule = makeCjs('exports'),
		cjsModuleModule = makeCjs('module'),

		runFactory = function (module, args) {
			req.trace('loader-run-factory', [module.mid]);
			var factory = module.def,
				result;
			if (has('config-dojo-loader-catches')) {
				try {
					result = isFunction(factory) ? factory.apply(null, args) : factory;
				}
				catch (e) {
					signal(ERROR, module.result = makeError('factoryThrew', [module, e]));
				}
			}
			else {
				result = isFunction(factory) ? factory.apply(null, args) : factory;
			}
			module.result = result === undefined && module.cjs ? module.cjs.exports : result;
		},

		abortExec = {},

		defOrder = 0,

		promoteModuleToPlugin = function (pluginModule) {
			var plugin = pluginModule.result;
			pluginModule.dynamic = plugin.dynamic;
			pluginModule.normalize = plugin.normalize;
			pluginModule.load = plugin.load;
			return pluginModule;
		},

		resolvePluginLoadQ = function (plugin) {
			// plugins is a newly executed module that has a loadQ waiting to run

			// step 1: traverse the loadQ and fixup the mid and prid; remember the map from original mid to new mid
			// recall the original mid was created before the plugin was on board and therefore it was impossible to
			// compute the final mid; accordingly, prid may or may not change, but the mid will definitely change
			var map = {};
			forEach(plugin.loadQ, function (pseudoPluginResource) {
				// manufacture and insert the real module in modules
				var prid = resolvePluginResourceId(plugin, pseudoPluginResource.prid, pseudoPluginResource.req.module),
					mid = plugin.dynamic ? pseudoPluginResource.mid.replace(/waitingForPlugin$/, prid) : (plugin.mid + '!' + prid),
					pluginResource = mix(mix({}, pseudoPluginResource), { mid: mid, prid: prid, injected: false });
				if (!modules[mid]) {
					// create a new (the real) plugin resource and inject it normally now that the plugin is on board
					injectPlugin(modules[mid] = pluginResource);
				} // else this was a duplicate request for the same (plugin, rid) for a nondynamic plugin

				// pluginResource is really just a placeholder with the wrong mid (because we couldn't calculate it until the plugin was on board)
				// mark is as arrived and delete it from modules; the real module was requested above
				map[pseudoPluginResource.mid] = modules[mid];
				setArrived(pseudoPluginResource);
				delete modules[pseudoPluginResource.mid];
			});
			plugin.loadQ = null;

			// step2: replace all references to any placeholder modules with real modules
			var substituteModules = function (module) {
				for (var replacement, deps = module.deps || [], i = 0; i < deps.length; i++) {
					replacement = map[deps[i].mid];
					if (replacement) {
						deps[i] = replacement;
					}
				}
			};
			for (var k in modules) {
				substituteModules(modules[k]);
			}
			forEach(execQ, substituteModules);
		},

		finishExec = function (module) {
			req.trace('loader-finish-exec', [module.mid]);
			module.executed = EXECUTED;
			module.defOrder = defOrder++;
			if (module.loadQ) {
				// the module was a plugin
				promoteModuleToPlugin(module);
				resolvePluginLoadQ(module);
			}
			// remove all occurrences of this module from the execQ
			for (var i = 0; i < execQ.length;) {
				if (execQ[i] === module) {
					execQ.splice(i, 1);
				}
				else {
					i++;
				}
			}
			// delete references to synthetic modules
			if (/^require\*/.test(module.mid)) {
				delete modules[module.mid];
			}
		},

		circleTrace = [],

		execModule = function (module, strict) {
			// run the dependency array, then run the factory for module
			if (module.executed === EXECUTING) {
				req.trace('loader-circular-dependency', [circleTrace.concat(module.mid).join('->')]);
				return (!module.def || strict) ? abortExec : (module.cjs && module.cjs.exports);
			}

			// at this point the module is either not executed or fully executed
			if (!module.executed) {
				if (!module.def) {
					return abortExec;
				}
				var mid = module.mid,
					deps = module.deps || [],
					arg, argResult,
					args = [],
					i = 0;

				if (has('dojo-trace-api')) {
					circleTrace.push(mid);
					req.trace('loader-exec-module', ['exec', circleTrace.length, mid]);
				}

				// for circular dependencies, assume the first module encountered was executed OK
				// modules that circularly depend on a module that has not run its factory will get
				// the pre-made cjs.exports===module.result. They can take a reference to this object and/or
				// add properties to it. When the module finally runs its factory, the factory can
				// read/write/replace this object. Notice that so long as the object isn't replaced, any
				// reference taken earlier while walking the deps list is still valid.
				module.executed = EXECUTING;
				while (i < deps.length) {
					arg = deps[i++];
					argResult = ((arg === cjsRequireModule) ? createRequire(module) :
									((arg === cjsExportsModule) ? module.cjs.exports :
										((arg === cjsModuleModule) ? module.cjs :
											execModule(arg, strict))));
					if (argResult === abortExec) {
						module.executed = false;
						req.trace('loader-exec-module', ['abort', mid]);
						has('dojo-trace-api') && circleTrace.pop();
						return abortExec;
					}
					args.push(argResult);
				}
				runFactory(module, args);
				finishExec(module);
				has('dojo-trace-api') && circleTrace.pop();
			}
			// at this point the module is guaranteed fully executed

			return module.result;
		},


		checkCompleteGuard = 0,

		guardCheckComplete = function (proc) {
			try {
				checkCompleteGuard++;
				proc();
			}
			finally {
				checkCompleteGuard--;
			}
			if (execComplete()) {
				signal('idle', []);
			}
		},

		checkComplete = function () {
			// keep going through the execQ as long as at least one factory is executed
			// plugins, recursion, cached modules all make for many execution path possibilities
			if (checkCompleteGuard) {
				return;
			}
			guardCheckComplete(function () {
				for (var currentDefOrder, module, i = 0; i < execQ.length;) {
					currentDefOrder = defOrder;
					module = execQ[i];
					execModule(module);
					if (currentDefOrder !== defOrder) {
						// defOrder was bumped one or more times indicating something was executed (note, this indicates
						// the execQ was modified, maybe a lot (for example a later module causes an earlier module to execute)
						i = 0;
					}
					else {
						// nothing happened; check the next module in the exec queue
						i++;
					}
				}
			});
		};


	if (has('dojo-undef-api')) {
		req.undef = function (moduleId, referenceModule) {
			// In order to reload a module, it must be undefined (this routine) and then re-requested.
			// This is useful for testing frameworks (at least).
			var module = getModule(moduleId, referenceModule);
			setArrived(module);
			delete modules[module.mid];
		};
	}

	if (has('dojo-inject-api')) {
		if (has('dojo-loader-eval-hint-url') === undefined) {
			has.add('dojo-loader-eval-hint-url', true);
		}

		var fixupUrl = function (url) {
				url += ''; // make sure url is a Javascript string (some paths may be a Java string)
				return url + (cacheBust ? ((/\?/.test(url) ? '&' : '?') + cacheBust) : '');
			},

			injectPlugin = function (module) {
				// injects the plugin module given by module; may have to inject the plugin itself
				var plugin = module.plugin;

				if (plugin.executed === EXECUTED && !plugin.load) {
					// executed the module not knowing it was a plugin
					promoteModuleToPlugin(plugin);
				}

				var onLoad = function (def) {
						module.result = def;
						setArrived(module);
						finishExec(module);
						checkComplete();
					};

				if (plugin.load) {
					plugin.load(module.prid, module.req, onLoad);
				}
				else if (plugin.loadQ) {
					plugin.loadQ.push(module);
				}
				else {
					// the unshift instead of push is important: we don't want plugins to execute as
					// dependencies of some other module because this may cause circles when the plugin
					// loadQ is run; also, generally, we want plugins to run early since they may load
					// several other modules and therefore can potentially unblock many modules
					plugin.loadQ = [module];
					execQ.unshift(plugin);
					injectModule(plugin);
				}
			},

			// for IE, injecting a module may result in a recursive execution if the module is in the cache

			cached,

			injectingModule = false,

			injectingCachedModule = false,

			evalModuleText = function (text, module) {
				// see def() for the injectingCachedModule bracket; it simply causes a short, safe circuit
				if (has('config-stripStrict')) {
					text = text.replace(/"use strict"/g, '');
				}
				injectingCachedModule = true;
				if (has('config-dojo-loader-catches')) {
					try {
						if (text === cached) {
							cached.call(null);
						}
						else {
							req.eval(text, has('dojo-loader-eval-hint-url') ? module.url : module.mid);
						}
					}
					catch (e) {
						signal(ERROR, makeError('evalModuleThrew', module));
					}
				}
				else {
					if (text === cached) {
						cached.call(null);
					}
					else {
						req.eval(text, has('dojo-loader-eval-hint-url') ? module.url : module.mid);
					}
				}
				injectingCachedModule = false;
			},

			injectModule = function (module) {
				// Inject the module. In the browser environment, this means appending a script element into
				// the document; in other environments, it means loading a file.
				//
				// If in synchronous mode, then get the module synchronously if it's not xdomainLoading.

				var mid = module.mid,
					url = module.url;
				if (module.executed || module.injected || waiting[mid] || (module.url && ((module.pack && waiting[module.url] === module.pack) || waiting[module.url] === true))) {
					return;
				}
				setRequested(module);

				if (module.plugin) {
					injectPlugin(module);
					return;
				} // else a normal module (not a plugin)

				var onLoadCallback = function () {
					runDefQ(module);
					if (module.injected !== ARRIVED) {
						// the script that contained the module arrived and has been executed yet
						// nothing was added to the defQ (so it wasn't an AMD module) and the module
						// wasn't marked as arrived by dojo.provide (so it wasn't a v1.6- module);
						// therefore, it must not have been a module; adjust state accordingly
						setArrived(module);
						mix(module, nonModuleProps);
						req.trace('loader-define-nonmodule', [module.url]);
					}

					checkComplete();
				};
				cached = cache[mid] || cache[urlKeyPrefix + module.url];
				if (cached) {
					req.trace('loader-inject', ['cache', module.mid, url]);
					evalModuleText(cached, module);
					onLoadCallback();
					return;
				}

				req.trace('loader-inject', ['script', module.mid, url]);
				injectingModule = module;
				req.injectUrl(fixupUrl(url), onLoadCallback, module);
				injectingModule = false;
			},

			defineModule = function (module, deps, def) {
				req.trace('loader-define-module', [module.mid, deps]);

				if (module.injected === ARRIVED) {
					signal(ERROR, makeError('multipleDefine', module));
					return module;
				}
				mix(module, {
					deps: deps,
					def: def,
					cjs: {
						id: module.mid,
						uri: module.url,
						exports: (module.result = {}),
						setExports: function (exports) {
							module.cjs.exports = exports;
						},
						config: function () {
							return module.config;
						}
					}
				});

				// resolve deps with respect to this module
				for (var i = 0; i < deps.length; i++) {
					deps[i] = getModule(deps[i], module);
				}

				setArrived(module);

				if (!isFunction(def) && !deps.length) {
					module.result = def;
					finishExec(module);
				}

				return module;
			},

			runDefQ = function (referenceModule, mids) {
				// defQ is an array of [id, dependencies, factory]
				// mids (if any) is a array of mids given by a combo service
				var definedModules = [],
					module, args;
				while (defQ.length) {
					args = defQ.shift();
					mids && (args[0] = mids.shift());
					// explicit define indicates possible multiple modules in a single file; delay injecting dependencies until defQ fully
					// processed since modules earlier in the queue depend on already-arrived modules that are later in the queue
					// TODO: what if no args[0] and no referenceModule
					module = (args[0] && getModule(args[0])) || referenceModule;
					definedModules.push([module, args[1], args[2]]);
				}
				consumePendingCacheInsert(referenceModule);
				forEach(definedModules, function (args) {
					injectDependencies(defineModule.apply(null, args));
				});
			};
	}

	var timerId = 0,
		clearTimer = noop,
		startTimer = noop;
	if (has('dojo-timeout-api')) {
		// Timer machinery that monitors how long the loader is waiting and signals an error when the timer runs out.
		clearTimer = function () {
			timerId && clearTimeout(timerId);
			timerId = 0;
		};

		startTimer = function () {
			clearTimer();
			if (req.waitms) {
				timerId = window.setTimeout(function () {
					clearTimer();
					signal(ERROR, makeError('timeout', waiting));
				}, req.waitms);
			}
		};
	}

	if (has('dom') && (has('dojo-inject-api') || has('dojo-dom-ready-api'))) {
		var domOn = function (node, eventName, handler) {
				// Add an event listener to a DOM node using the API appropriate for the current browser;
				// return a function that will disconnect the listener.
				node.addEventListener(eventName, handler, false);
				return function () {
					node.removeEventListener(eventName, handler, false);
				};
			},
			windowOnLoadListener = domOn(window, 'load', function () {
				req.pageLoaded = true;
				doc.readyState !== 'complete' && (doc.readyState = 'complete');
				windowOnLoadListener();
			});

		if (has('dojo-inject-api')) {
			req.injectUrl = function (url, callback, owner) {
				var node = owner.node = doc.createElement('script'),
					onLoad = function (event) {
						if (event.type === 'load') {
							loadDisconnector();
							errorDisconnector();
							callback && callback();
						}
					},
					loadDisconnector = domOn(node, 'load', onLoad),
					errorDisconnector = domOn(node, 'error', function (e) {
						loadDisconnector();
						errorDisconnector();
						signal(ERROR, makeError('scriptError', [url, e]));
					});

				node.charset = 'utf-8';
				node.src = url;
				document.head.appendChild(node);
				return node;
			};
		}
	}

	if (has('dojo-log-api')) {
		req.log = function () {
			try {
				for (var i = 0; i < arguments.length; i++) {
					console.log(arguments[i]);
				}
			}
			catch (e) {}
		};
	}
	else {
		req.log = noop;
	}

	if (has('dojo-trace-api')) {
		var trace = req.trace = function (
			group,	// the trace group to which this application belongs
			args	// the contents of the trace
		) {
			///
			// Tracing interface by group.
			//
			// Sends the contents of args to the console iff (req.trace.on && req.trace[group])

			if (trace.on && trace.group[group]) {
				signal('trace', [group, args]);
				for (var arg, dump = [], text = 'trace:' + group + (args.length ? (':' + args[0]) : ''), i = 1; i < args.length;) {
					arg = args[i++];
					if (isString(arg)) {
						text += ', ' + arg;
					}
					else {
						dump.push(arg);
					}
				}
				req.log(text);
				dump.length && dump.push('.');
				req.log.apply(req, dump);
			}
		};
		mix(trace, {
			on: true,
			group: {},
			set: function (group, value) {
				if (isString(group)) {
					trace.group[group] = value;
				}
				else {
					mix(trace.group, group);
				}
			}
		});
		trace.set(mix(mix({}, defaultConfig.trace), userConfig.trace));
		on('config', function (config) {
			config.trace && trace.set(config.trace);
		});
	}
	else {
		req.trace = noop;
	}

	/**
	 * @param mid //(commonjs.moduleId, optional) list of modules to be loaded before running factory
	 * @param dependencies //(array of commonjs.moduleId, optional)
	 * @param factory //(any)
	 */
	var def = function (mid, dependencies, factory) {
		///
		// Advises the loader of a module factory. //Implements http://wiki.commonjs.org/wiki/Modules/AsynchronousDefinition.
		///
		//note
		// CommonJS factory scan courtesy of http://requirejs.org

		var arity = arguments.length,
			defaultDeps = ['require', 'exports', 'module'],
			// the predominate signature...
			args = [null, mid, dependencies];
		if (arity === 1) {
			args = [null, (isFunction(mid) ? defaultDeps : []), mid];
		}
		else if (arity === 2 && isString(mid)) {
			args = [mid, (isFunction(dependencies) ? defaultDeps : []), dependencies];
		}
		else if (arity === 3) {
			args = [mid, dependencies, factory];
		}

		if (has('dojo-amd-factory-scan') && args[1] === defaultDeps) {
			args[2].toString()
				.replace(/(\/\*([\s\S]*?)\*\/|\/\/(.*)$)/mg, '')
				.replace(/require\(["']([\w\!\-_\.\/]+)["']\)/g, function (match, dep) {
				args[1].push(dep);
			});
		}

		req.trace('loader-define', args.slice(0, 2));
		var targetModule = args[0] && getModule(args[0]);
		if (targetModule && !waiting[targetModule.mid]) {
			// given a mid that hasn't been requested; therefore, defined through means other than injecting
			// consequent to a require() or define() application; examples include defining modules on-the-fly
			// due to some code path or including a module in a script element. In any case,
			// there is no callback waiting to finish processing and nothing to trigger the defQ and the
			// dependencies are never requested; therefore, do it here.
			injectDependencies(defineModule(targetModule, args[1], args[2]));
		}
		else {
			// anonymous module and therefore must have been injected; therefore, onLoad will fire immediately
			// after script finishes being evaluated and the defQ can be run from that callback to detect the module id
			defQ.push(args);
		}
	};
	def.amd = {
		vendor: 'dojotoolkit.org'
	};

	if (has('dojo-requirejs-api')) {
		req.def = def;
	}

	// allow config to override default implementation of named functions; this is useful for
	// non-browser environments, e.g., overriding injectUrl, getText, log, etc. in node.js, etc.
	// also useful for testing and monkey patching loader
	mix(mix(req, defaultConfig.loaderPatch), userConfig.loaderPatch);

	// now that req is fully initialized and won't change, we can hook it up to the error signal
	on(ERROR, function (arg) {
		try {
			console.error(arg);
			if (arg instanceof Error) {
				for (var k in arg) {
					console.log(k + ':', arg[k]);
				}
				console.log('.');
			}
		}
		catch (e) {}
	});

	// always publish these
	mix(req, {
		cache: cache,
		packs: packs
	});

	if (has('dojo-publish-privates')) {
		mix(req, {
			// these may be interesting to look at when debugging
			modules: modules,
			execQ: execQ,
			defQ: defQ,
			waiting: waiting,

			// these are used for testing
			// TODO: move testing infrastructure to a different has feature
			packs: packs,
			mapProgs: mapProgs,
			pathsMapProg: pathsMapProg,
			listenerQueues: listenerQueues,

			// these are used by the builder (at least)
			computeMapProg: computeMapProg,
			runMapProg: runMapProg,
			compactPath: compactPath,
			getModuleInfo: _getModuleInfo
		});
	}

	// the loader can be defined exactly once; look for global define which is the symbol AMD loaders are
	// *required* to define (as opposed to require, which is optional)
	if (global.define) {
		if (has('dojo-log-api')) {
			signal(ERROR, makeError('defineAlreadyDefined', 0));
		}
		return;
	}
	else {
		global.define = def;
		global.require = req;
		if (has('host-node')) {
			require = req;
		}
	}

	if (has('dojo-config-api')) {
		forEach(delayedModuleConfig, function (c) { config(c); });
		var bootDeps = userConfig.deps || defaultConfig.deps,
			bootCallback = userConfig.callback || defaultConfig.callback;
		req.boot = (bootDeps || bootCallback) ? [bootDeps || [], bootCallback] : null;
	}
	if (!has('dojo-built')) {
		req.boot && req.apply(null, req.boot);
	}
})
//>>excludeStart("replaceLoaderConfig", kwArgs.replaceLoaderConfig);
(
	// userConfig
	(function () {
		// make sure we're looking at global dojoConfig etc.
		return this.dojoConfig || this.require || {};
	})(),

	// defaultConfig
	{
		// the default configuration for a browser; this will be modified by other environments
		// use hasCache instead of has for the sake of efficiency; the two are equivalent,
		// but using hasCache bypasses a loop + n calls to has.add
		hasCache: {
			'host-browser': true,
			'dom': true,
			'dojo-amd-factory-scan': true,
			'dojo-loader': true,
			'dojo-has-api': true,
			'dojo-inject-api': true,
			'dojo-timeout-api': true,
			'dojo-trace-api': true,
			'dojo-log-api': true,
			'dojo-dom-ready-api': true,
			'dojo-publish-privates': true,
			'dojo-config-api': true,
			'dojo-sniff-baseUrl': true,
			'config-deferredInstrumentation': true,
			'config-useDeferredInstrumentation': 'report-unhandled-rejections'
		},
		packages: [{
			// note: like v1.6-, this bootstrap computes baseUrl to be the dojo directory
			name: 'dojo',
			location: '.'
		}, {
			name: 'tests',
			location: './tests'
		}, {
			name: 'dijit',
			location: '../dijit'
		}, {
			name: 'build',
			location: '../util/build'
		}, {
			name: 'doh',
			location: '../util/doh'
		}, {
			name: 'dojox',
			location: '../dojox'
		}, {
			name: 'demos',
			location: '../demos'
		}],
		trace: {
			// these are listed so it's simple to turn them on/off while debugging loading
			'loader-inject': false,
			'loader-define': false,
			'loader-exec-module': false,
			'loader-run-factory': false,
			'loader-finish-exec': false,
			'loader-define-module': false,
			'loader-circular-dependency': false,
			'loader-define-nonmodule': false
		},
		waitSeconds: 15
	}
);
//>>excludeEnd("replaceLoaderConfig")
