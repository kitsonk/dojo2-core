define([
	'teststack!tdd',
	'teststack/lib/assert',
	'require'
], function (test, assert, require) {
	test.suite('demo', function () {
		test.before(function () {
			return this.remote.get(require.toUrl('./demo.html'));
		});

		test.test('it works', function () {
			return this.remote.elementById('testInput')
				.clickElement()
				.keys('hello')
				.end()
				.elementById('submitButton')
				.clickElement()
				.end()
				.alertText().then(function (text) {
					assert.isEqual(text, 'hello', 'alert shows text from input');
				})
				.dismissAlert();
		});
	});
});