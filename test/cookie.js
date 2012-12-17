define([ 'dojo/has', 'dojo/has!host-browser?dojo/cookie' ], function (has, cookie) {
	var aKey = 'a=; ',
		aValue = 'a1=; ',
		bKey = 'b=; ',
		bValue = 'b1=; ';

	return {
		name: 'cookie',
		setup: function (suite) {
			if (!has('host-browser')) {
				suite.skip('Not supported on this platform');
				return;
			}

			if (!navigator.cookieEnabled) {
				suite.skip('Cookies not enabled in the current environment');
			}
		},

		beforeEach: function eraseAllCookies() {
			var aWhileAgo = new Date(1970, 0, 1).toUTCString(),
				cookies = document.cookie.split('; ');

			cookies.forEach(function (cookie) {
				document.cookie = cookie.split('=', 1)[0] + '=; expires=' + aWhileAgo;
			});

			if (document.cookie.length) {
				throw new Error('Failed to erase cookies');
			}
		},

		tests: {
			'basic tests': function (assert) {
				assert.isEqual(cookie.length, 0, 'no cookies exist');
				assert.isEqual(cookie.getItem(aKey), null, 'a value is null');

				cookie.setItem(aKey, aValue);
				assert.isEqual(cookie.length, 1, 'one cookie exists after set');
				assert.isEqual(cookie.getItem(bKey), null, 'b value is null');

				cookie.setItem(bKey, bValue);
				assert.isEqual(cookie.length, 2, 'two cookies exist after set');
				assert.isEqual(cookie.getItem(aKey), aValue, 'a value is a1');
				assert.isEqual(cookie.getItem(bKey), bValue, 'b value is b1');

				cookie.setItem(aKey, bValue);
				assert.isEqual(cookie.length, 2, 'setting already existing cookie does not add new cookie');
				assert.isEqual(cookie.getItem(aKey), bValue, 'a value is changed to b1');

				assert.isEqual(cookie.key(0), aKey, 'key 0 is a');
				assert.isEqual(cookie.key(1), bKey, 'key 1 is b');
				assert.isEqual(cookie.key(2), null, 'key 2 is null');

				cookie.removeItem(aKey);
				assert.isEqual(cookie.length, 1, 'one cookie exists after remove');
				assert.isEqual(cookie.key(0), bKey, 'key 0 is b');
				assert.isEqual(cookie.key(1), null, 'key 1 is null');

				cookie.removeItem(bKey);
				assert.isEqual(cookie.length, 0, 'no cookies exist after remove');
				assert.isEqual(document.cookie.length, 0, 'document.cookie is also empty');
			},

			'expires': function (assert, done) {
				done.callsToComplete = 2;

				assert.isEqual(cookie.length, 0, 'no cookies exist');
				cookie.setItem(aKey, aValue, { expires: new Date(1970, 0, 1) });
				assert.isEqual(cookie.length, 0, 'expired cookie was not set');

				var aFewSecondsFromNow = new Date(),
					secondsToWait = 2;

				aFewSecondsFromNow.setSeconds(aFewSecondsFromNow.getSeconds() + secondsToWait);
				cookie.setItem(aKey, aValue, { expires: aFewSecondsFromNow });
				assert.isEqual(cookie.length, 1, 'expiring cookie a is set');

				aFewSecondsFromNow = new Date(aFewSecondsFromNow).setSeconds(aFewSecondsFromNow.getSeconds() + secondsToWait);
				cookie.setItem(bKey, bValue, { expires: aFewSecondsFromNow });
				assert.isEqual(cookie.length, 2, 'expiring cookie b is set');

				setTimeout(function () {
					assert.isEqual(cookie.length, 1, 'one expired cookie expired');
					assert.isEqual(cookie.getItem(aKey), null, 'cookie a correctly expired');
					done();
				}, (secondsToWait + 1) * 1000);

				setTimeout(function () {
					assert.isEqual(cookie.length, 0, 'two expired cookies expired');
					done();
				}, (secondsToWait + 1) * 1000 * 2);

				return done;
			},

			'maxAge': function (assert) {

			},

			'path': function (assert) {

			},

			'domain': function (assert) {

			}
		}
	};
});