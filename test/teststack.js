define({
	// The port on which the instrumenting proxy will listen
	proxyPort: 9000,

	// A fully qualified URL to the client.html that is passed to remotely driven browsers for unit testing
	clientHtmlLocation: 'http://localhost:9000/client.html',

	// Browsers to run integration testing against. Note that version numbers must be strings if used with Sauce
	// OnDemand. Available options are browserName, browserVersion, platformName, and platformVersion
	browsers: [
		{ browserName: 'internet explorer', platformName: 'Windows 2012', browserVersion: '10' },
		{ browserName: 'internet explorer', platformName: 'Windows 2008', browserVersion: '9' },
		{ browserName: 'firefox', platformName: [ 'Linux', 'Mac 10.6', 'Windows 2012' ] },
		{ browserName: 'chrome', platformName: [ 'Linux', 'Mac 10.8', 'Windows 2008' ] },
		{ browserName: 'safari', platformName: 'Mac 10.8', browserVersion: '6' },
		{ browserName: 'safari', platformName: 'Mac 10.6', browserVersion: '5' },
// TODO: OperaDriver does not support async script execution, so disable until results are sent back by XHR
//		{ browserName: 'opera', platformName: [ 'LINUX', 'MAC', 'WINDOWS' ] }
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
	packages: null,

	// Non-functional test suite(s) to run in each browser
	suites: [ 'dojo/test/all' ],

	// Functional test suite(s) to run in each browser once non-functional tests are completed
	functionalSuites: [ 'dojo/test/functional' ]
});