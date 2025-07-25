import React, { useState, useEffect } from 'react';
import { Upload, MessageCircle, RefreshCw, ChevronDown, ChevronUp, X, Send, Moon, Sun, Eye, Trash2 } from 'lucide-react';

const API_BASE = 'https://builder.empromptu.ai/api_tools';
const API_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer d4c03a1f5c51feec3ce1bfe53f835fe4',
  'X-Generated-App-ID': 'e89baedc-910e-44b2-9fc2-846275040ea7',
  'X-Usage-Key': '53fb7507b246072e7bd6cc437b147808'
};

const OKRTracker = () => {
  const [initiatives, setInitiatives] = useState([]);
  const [selectedInitiative, setSelectedInitiative] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentId, setAgentId] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [apiLogs, setApiLogs] = useState([]);
  const [showApiLogs, setShowApiLogs] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const logApiCall = (method, endpoint, data, response) => {
    setApiLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      method,
      endpoint,
      data,
      response,
      id: Date.now()
    }]);
  };

  const initializeChatbot = async () => {
    try {
      const requestData = {
        instructions: `You are an OKR Initiative Update Assistant. Your job is to help employees update initiative status in natural language. 

        When an employee provides an update:
        1. If they don't specify which initiative, ask them to clarify from available initiatives
        2. Extract the status (on track, at risk, blocked) - if unclear, ask
        3. Extract any blockers, progress updates, or timeline changes
        4. Format the response as JSON with fields: initiative_name, status, progress_percentage, blockers, notes, date

        Be conversational but efficient. Always confirm which initiative they're updating.`,
        agent_name: "Initiative Update Assistant"
      };

      const response = await fetch(`${API_BASE}/create-agent`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(requestData)
      });
      const data = await response.json();
      logApiCall('POST', '/create-agent', requestData, data);
      setAgentId(data.agent_id);
    } catch (error) {
      console.error('Error initializing chatbot:', error);
    }
  };

  useEffect(() => {
    initializeChatbot();
  }, []);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setCurrentStep(2);
    setIsLoading(true);
    setUploadProgress(0);

    try {
      const fileContent = await file.text();
      setUploadProgress(33);

      // Step 1: Input CSV data
      const inputData = {
        created_object_name: 'initiatives_csv',
        data_type: 'strings',
        input_data: [fileContent]
      };

      const inputResponse = await fetch(`${API_BASE}/input_data`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(inputData)
      });
      const inputResult = await inputResponse.json();
      logApiCall('POST', '/input_data', inputData, inputResult);
      setUploadProgress(66);

      // Step 2: Process CSV into structured data
      const processData = {
        created_object_names: ['initiatives_data'],
        prompt_string: `Parse this CSV data into a JSON array of initiative objects. Each object should have: id, name, owner, status, progress_percentage, due_date, description, related_okr. Convert status to one of: "on track", "at risk", "blocked". Here's the CSV: {initiatives_csv}`,
        inputs: [{
          input_object_name: 'initiatives_csv',
          mode: 'combine_events'
        }]
      };

      const processResponse = await fetch(`${API_BASE}/apply_prompt`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(processData)
      });
      const processResult = await processResponse.json();
      logApiCall('POST', '/apply_prompt', processData, processResult);
      setUploadProgress(100);

      await loadInitiatives();
      setCurrentStep(3);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInitiatives = async () => {
    try {
      const requestData = {
        object_name: 'initiatives_data',
        return_type: 'json'
      };

      const response = await fetch(`${API_BASE}/return_data`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(requestData)
      });
      const data = await response.json();
      logApiCall('POST', '/return_data', requestData, data);

      if (data.value) {
        let parsedData;
        try {
          parsedData = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        } catch (e) {
          parsedData = Array.isArray(data.value) ? data.value : [data.value];
        }
        setInitiatives(Array.isArray(parsedData) ? parsedData : [parsedData]);
      }
    } catch (error) {
      console.error('Error loading initiatives:', error);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || !agentId) return;

    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { type: 'user', message: userMessage }]);
    setChatInput('');

    try {
      const requestData = {
        agent_id: agentId,
        message: `Current initiatives: ${initiatives.map(i => i.name || i.id).join(', ')}. User update: ${userMessage}`
      };

      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(requestData)
      });
      const data = await response.json();
      logApiCall('POST', '/chat', requestData, data);
      setChatMessages(prev => [...prev, { type: 'bot', message: data.response }]);

      // Try to extract structured update from bot response
      if (data.response.includes('{') && data.response.includes('}')) {
        await processUpdate(data.response);
      }
    } catch (error) {
      console.error('Error in chat:', error);
    }
  };

  const processUpdate = async (botResponse) => {
    try {
      // Input the chat update
      const inputData = {
        created_object_name: 'chat_updates',
        data_type: 'strings',
        input_data: [botResponse]
      };

      const inputResponse = await fetch(`${API_BASE}/input_data`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(inputData)
      });
      const inputResult = await inputResponse.json();
      logApiCall('POST', '/input_data', inputData, inputResult);

      // Apply the update to initiatives
      const updateData = {
        created_object_names: ['updated_initiatives'],
        prompt_string: `Update the initiatives data {initiatives_data} with the new information from {chat_updates}. Return the complete updated JSON array of all initiatives.`,
        inputs: [
          { input_object_name: 'initiatives_data', mode: 'combine_events' },
          { input_object_name: 'chat_updates', mode: 'combine_events' }
        ]
      };

      const updateResponse = await fetch(`${API_BASE}/apply_prompt`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(updateData)
      });
      const updateResult = await updateResponse.json();
      logApiCall('POST', '/apply_prompt', updateData, updateResult);

      // Get the updated data
      const returnData = {
        object_name: 'updated_initiatives',
        return_type: 'json'
      };

      const returnResponse = await fetch(`${API_BASE}/return_data`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(returnData)
      });
      const returnResult = await returnResponse.json();
      logApiCall('POST', '/return_data', returnData, returnResult);

      // Replace initiatives_data with updated data
      const replaceData = {
        created_object_name: 'initiatives_data',
        data_type: 'strings',
        input_data: [typeof returnResult.value === 'string' ? returnResult.value : JSON.stringify(returnResult.value)]
      };

      const replaceResponse = await fetch(`${API_BASE}/input_data`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(replaceData)
      });
      const replaceResult = await replaceResponse.json();
      logApiCall('POST', '/input_data', replaceData, replaceResult);

      await loadInitiatives();
    } catch (error) {
      console.error('Error processing update:', error);
    }
  };

  const deleteAllObjects = async () => {
    const objects = ['initiatives_csv', 'initiatives_data', 'chat_updates', 'updated_initiatives'];
    for (const obj of objects) {
      try {
        const response = await fetch(`${API_BASE}/objects/${obj}`, {
          method: 'DELETE',
          headers: API_HEADERS
        });
        const result = await response.json();
        logApiCall('DELETE', `/objects/${obj}`, null, result);
      } catch (error) {
        console.error(`Error deleting ${obj}:`, error);
      }
    }
    setInitiatives([]);
    setChatMessages([]);
    setCurrentStep(1);
  };

  const downloadCSV = () => {
    const csvContent = [
      'Initiative ID/Name,Owner,Status,Progress percentage,Due date,Description,Related OKR/Goal',
      ...initiatives.map(i => 
        `"${i.name || i.id}","${i.owner}","${i.status}","${i.progress_percentage}%","${i.due_date}","${i.description}","${i.related_okr}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'initiatives.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'on track': return 'bg-green-500';
      case 'at risk': return 'bg-yellow-500';
      case 'blocked': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'on track': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'at risk': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'blocked': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">OKR & Initiative Tracker</h1>
            <p className="text-gray-600 dark:text-gray-400">Executive dashboard for strategic initiative monitoring</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="btn btn-secondary"
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowApiLogs(!showApiLogs)}
              className="btn bg-green-600 text-white hover:bg-green-700"
              aria-label="Show API logs"
            >
              <Eye className="w-4 h-4 mr-2" />
              API Logs
            </button>
            <button
              onClick={deleteAllObjects}
              className="btn btn-danger"
              aria-label="Delete all data"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Data
            </button>
          </div>
        </div>

        {/* API Logs Modal */}
        {showApiLogs && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-4xl max-h-96 overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">API Call Logs</h3>
                <button onClick={() => setShowApiLogs(false)} className="btn btn-secondary">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                {apiLogs.map(log => (
                  <div key={log.id} className="border rounded p-2 dark:border-gray-600">
                    <div className="font-mono text-blue-600 dark:text-blue-400">
                      {log.method} {log.endpoint}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">{log.timestamp}</div>
                    <details className="mt-2">
                      <summary className="cursor-pointer">Request/Response</summary>
                      <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-auto">
                        Request: {JSON.stringify(log.data, null, 2)}
                        Response: {JSON.stringify(log.response, null, 2)}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Three-Step Upload Flow */}
        {currentStep === 1 && (
          <div className="card p-8 mb-8">
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Step 1: Upload Initiative Data</h2>
              <div className="border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-2xl p-12 bg-blue-50 dark:bg-blue-900/20">
                <Upload className="w-16 h-16 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
                <p className="text-lg mb-4 text-gray-700 dark:text-gray-300">Drag and drop your CSV file here</p>
                
                {/* Fixed File Input */}
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                  disabled={isLoading}
                />
                <label 
                  htmlFor="csv-upload" 
                  className={`inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-medium transition-colors cursor-pointer hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isLoading ? 'Processing...' : 'Choose File'}
                </label>
                
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
                  Expected format: Initiative ID/Name, Owner, Status, Progress percentage, Due date, Description, Related OKR/Goal
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Processing */}
        {currentStep === 2 && (
          <div className="card p-8 mb-8">
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Step 2: Processing Data</h2>
              <div className="spinner mx-auto mb-4"></div>
              <p className="text-lg mb-4 text-gray-700 dark:text-gray-300">Extracting and structuring initiative data...</p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{uploadProgress}% complete</p>
            </div>
          </div>
        )}

        {/* Step 3: Dashboard */}
        {currentStep === 3 && (
          <>
            {/* Controls */}
            <div className="flex flex-wrap gap-4 mb-6">
              <button
                onClick={() => setCurrentStep(1)}
                className="btn btn-primary"
                aria-label="Upload new CSV"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload New CSV
              </button>
              
              <button
                onClick={() => setShowChat(!showChat)}
                className="btn btn-secondary"
                aria-label="Toggle status updates"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Update Status
              </button>
              
              <button
                onClick={loadInitiatives}
                className="btn btn-secondary"
                aria-label="Refresh dashboard"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </button>

              <button
                onClick={downloadCSV}
                className="btn btn-success"
                aria-label="Download CSV"
              >
                Download CSV
              </button>
            </div>

            {/* Data Output Table */}
            <div className="card mb-6 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table table-striped w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Initiative</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Owner</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Progress</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">OKR</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {initiatives.map((initiative, idx) => (
                      <React.Fragment key={idx}>
                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(initiative.status)}`}></div>
                              <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeColor(initiative.status)}`}>
                                {initiative.status}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {initiative.name || initiative.id}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {initiative.owner}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                            {initiative.progress_percentage}%
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                            {initiative.related_okr}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => setSelectedInitiative(
                                selectedInitiative?.id === initiative.id ? null : initiative
                              )}
                              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                              aria-label={`${selectedInitiative?.id === initiative.id ? 'Hide' : 'Show'} details for ${initiative.name || initiative.id}`}
                            >
                              {selectedInitiative?.id === initiative.id ? 
                                <ChevronUp className="w-4 h-4" /> : 
                                <ChevronDown className="w-4 h-4" />
                              }
                            </button>
                          </td>
                        </tr>
                        {selectedInitiative?.id === initiative.id && (
                          <tr>
                            <td colSpan="6" className="px-6 py-4 bg-gray-50 dark:bg-gray-700">
                              <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                  <h4 className="font-medium mb-2 text-gray-900 dark:text-white">Description</h4>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">{initiative.description}</p>
                                </div>
                                <div>
                                  <h4 className="font-medium mb-2 text-gray-900 dark:text-white">Timeline</h4>
                                  <p className="text-sm text-gray-600 dark:text-gray-400">Due: {initiative.due_date}</p>
                                </div>
                                {initiative.blockers && (
                                  <div className="md:col-span-2">
                                    <h4 className="font-medium mb-2 text-gray-900 dark:text-white">Current Blockers</h4>
                                    <p className="text-sm text-red-600 dark:text-red-400">{initiative.blockers}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {initiatives.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">No initiatives loaded. Upload a CSV file to get started.</p>
              </div>
            )}
          </>
        )}

        {/* Chatbot Panel - Bottom Right */}
        {showChat && (
          <div className="fixed bottom-4 right-4 w-96 max-w-[calc(100vw-2rem)] z-40">
            <div className="card shadow-2xl">
              {/* Header */}
              <div className="bg-blue-600 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center">
                  <MessageCircle className="w-5 h-5 mr-2" />
                  <span className="font-medium">Initiative Updates</span>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  className="text-white hover:text-gray-200"
                  aria-label="Close chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="h-64 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-700" role="log" aria-live="polite">
                {chatMessages.length === 0 && (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Hi! I can help you update initiative status. Just tell me which initiative and what's happening.
                  </p>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`mb-3 ${msg.type === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className={`inline-block p-3 rounded-2xl max-w-xs ${
                      msg.type === 'user' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white dark:bg-gray-600 border dark:border-gray-500 text-gray-900 dark:text-white'
                    }`}>
                      <p className="text-sm">{msg.message}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="p-4 border-t dark:border-gray-600">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleChatSubmit()}
                    placeholder="Ask me anything..."
                    className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                    aria-label="Type your message"
                  />
                  <button
                    onClick={handleChatSubmit}
                    className="btn btn-primary"
                    disabled={!chatInput.trim()}
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OKRTracker;
