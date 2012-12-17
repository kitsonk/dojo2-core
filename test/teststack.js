define({
	// browsers to run integration testing against
	browsers: [
		{ browserName: 'internet explorer', version: [ 9, 10 ] },
		{ browserName: 'firefox', platform: [ 'LINUX', 'MAC', 'WINDOWS' ] },
		{ browserName: 'chrome', platform: [ 'LINUX', 'MAC', 'WINDOWS' ] },
		{ browserName: 'safari', platform: 'MAC', version: [ 5.1, 6 ] },
		{ browserName: 'opera', platform: [ 'LINUX', 'MAC', 'WINDOWS' ] }
	],

	// maximum number of simultaneous integration tests that can be executed on the remote WebDriver service
	maxConcurrency: 3,

	// connection information for the remote WebDriver service
	webdriver: {
		host: 'ondemand.saucelabs.com',
		port: 80,
		username: 'username',
		accessKey: 'foo'
	},

	// Packages that must be registered with the loader
	packages: [ 'dojo' ],

	// Test suite(s) to load and execute
	deps: [ 'dojo/test/all' ]
});