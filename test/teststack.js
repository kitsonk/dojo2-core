define({
	// The port on which the instrumenting proxy will listen
	proxyPort: 9000,

	// A fully qualified URL to the teststack proxy
	proxyUrl: 'http://localhost:9000/',

	// Browsers to run integration testing against. Note that version numbers must be strings if used with Sauce
	// OnDemand. Available options are browserName, version, platform, and platformVersion
	environments: [
		{ browserName: 'internet explorer', version: '10', platform: 'Windows 2012' },
		{ browserName: 'internet explorer', platform: 'Windows 2008', version: '9' },
		// Firefox 18 Mac is currently unavailable on Sauce Labs
		{ browserName: 'firefox', version: '18', platform: [ 'Linux', 'Windows 2012' ] },
		{ browserName: 'chrome', platform: [ 'Linux', 'Mac 10.8', 'Windows 2008' ] },
		{ browserName: 'safari', version: '6', platform: 'Mac 10.8' },
		{ browserName: 'safari', version: '5', platform: 'Mac 10.6' },
		// Opera Mac is currently unavailable on Sauce Labs
		{ browserName: 'opera', version: '12', platform: [ 'Linux', 'Windows 2008' ] }
	],

	// Maximum number of simultaneous integration tests that should be executed on the remote WebDriver service
	maxConcurrency: 3,

	// Whether or not to start Sauce Connect before running tests
	useSauceConnect: true,

	// Connection information for the remote WebDriver service. If using Sauce Labs, keep your username and password
	// in the SAUCE_USERNAME and SAUCE_ACCESS_KEY environment variables unless you are sure you will NEVER be
	// publishing this configuration file somewhere
	webdriver: {
		host: 'localhost',
		port: 4444
	},

	// Packages that should be registered with the loader in each testing environment
	packages: [ { name: 'dojo', location: 'dojo2-core' } ],

	// Non-functional test suite(s) to run in each browser
	suites: [ 'dojo/test/all' ],

	// Functional test suite(s) to run in each browser once non-functional tests are completed
	functionalSuites: [ 'dojo/test/functional' ]
});