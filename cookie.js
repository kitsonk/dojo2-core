define([], function () {
	// TODO: Put these utility functions somewhere else. dojo/string perhaps?

	/**
	 * Escapes a string to be used within a regular expression.
	 * @returns {string} Escaped string.
	 */
	function escapeString(/**string*/ string) {
		return string.replace(/[-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
	}

	/**
	 * Counts the number of instances of `needle` found inside `haystack`.
	 *
	 * @param haystack
	 * String to search.
	 *
	 * @param needle
	 * String to look for.
	 *
	 * @returns {number} Number of hits.
	 */
	function count(/**string*/ haystack, /**string*/ needle) {
		var hits = 0,
			lastIndex = haystack.indexOf(needle);

		while (lastIndex > -1) {
			++hits;
			lastIndex = haystack.indexOf(needle, lastIndex + 1);
		}

		return hits;
	}

	/**
	 * Options that may be used to remove a cookie.
	 *
	 * @name removeCookieOptions
	 *
	 * @property {string} path
	 * The path to use for the cookie.
	 */

	/**
	 * Options that may be used to set a cookie.
	 *
	 * @name cookieOptions
	 *
	 * @property {Date} expires
	 * The date at which the cookie should expire. By default, the cookie will expire when the browser closes.
	 *
	 * @property {number} maxAge
	 * The number of seconds from now that the cookie should expire. By default, the cookie will expire when the
	 * browser closes.
	 *
	 * @property {string} path
	 * The path to use for the cookie.
	 *
	 * @property {string} domain
	 * The domain to use for the cookie.
	 *
	 * @property {boolean} secure
	 * Whether or not to only send the cookie over secure connections.
	 */

	/**
	 * Creates a well-formed cookie options string.
	 * @returns {string}
	 */
	function createCookieOptions(/**cookieOptions*/ options) {
		var optionsString = '';
		for (var k in options) {
			if (k === 'maxAge') {
				k = 'max-age';
			}

			optionsString += '; ' + encodeURIComponent(k);

			if (k === 'secure') {
				// do nothing, secure is a boolean flag
			}
			else if (k === 'expires') {
				optionsString += '=' + encodeURIComponent(options[k].toUTCString());
			}
			else {
				optionsString += '=' + encodeURIComponent(options[k]);
			}
		}

		return optionsString;
	}

	if (!navigator.cookieEnabled) {
		return null;
	}

	var longAgo = new Date(1970, 0, 1).toUTCString();

	/**
	 * An interface for getting and setting cookies based on the DOM Storage API.
	 */
	return {
		/**
		 * The number of cookies that are currently set.
		 */
		get length() {
			return count(document.cookie, '; ');
		},

		/**
		 * Gets the key of the cookie at the given index.
		 * @returns {?string}
		 */
		key: function (/**number*/ index) {
			var keyValuePair = document.cookie.split('; ')[index];
			return keyValuePair ? /^([^=]+)/.exec(keyValuePair)[0] : null;
		},

		/**
		 * Gets the value of a cookie.
		 * @returns {?string}
		 */
		getItem: function (/**string*/ key) {
			var match = new RegExp('(?:^|; )' + escapeString(key) + '=([^;]*)').exec(document.cookie);
			return match ? decodeURIComponent(match[1]) : null;
		},

		/**
		 * Sets the value of a cookie.
		 */
		setItem: function (/**string*/ key, /**string*/ data, /**cookieOptions=*/ options) {
			document.cookie = encodeURIComponent(key) + '=' + encodeURIComponent(data) + createCookieOptions(options);
		},

		/**
		 * Removes a cookie.
		 */
		removeItem: function (/**string*/ key, /**removeCookieOptions=*/ options) {
			document.cookie = encodeURIComponent(key) + '=' + '; expires=' + longAgo + createCookieOptions(options);
		}
	};
});
